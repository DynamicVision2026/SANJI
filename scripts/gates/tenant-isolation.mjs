#!/usr/bin/env node
/**
 * §15.4 Tenant Isolation Gate — static migration analysis.
 *
 * Full check (when the DB is live, Week 9 §18.1): automated tests attempt
 * cross-tenant reads at org, branch, and assignment scope and assert failure.
 * What runs now is the static half: every table declared in db/migrations is
 * checked against an explicit classification derived from the v2.3 §5 schema.
 *
 * DESIGN RULE — fail loudly, never pass by omission (issue #5 finding 2). The
 * previous version of this gate only inspected tables that already had an
 * org_id column, so a tenant table created WITHOUT one was silently skipped —
 * exactly how user_branch_assignments and student_instructor_assignments
 * shipped unprotected. Now every discovered table MUST appear in exactly one
 * classification below, and every classified table MUST exist; anything else
 * fails the build.
 *
 * Classification (v2.3 §5.1/§5.2/§6.2 — cite the spec when changing):
 *  - ORG_KEYED: spec schema shows org_id → must have org_id + RLS + a policy.
 *    "Every tenant table, including join and assignment tables, without
 *    exception" (§5, §16.1).
 *  - JOIN_SCOPED: tenant data whose spec schema has no org_id; RLS enforced
 *    via a join policy (student/branch/worksheet) → must have RLS + a policy.
 *  - GLOBAL: shared/global by spec design → no RLS; must NOT grow an org_id
 *    (that would mean the classification here is stale — reclassify, don't
 *    ignore).
 */
import { REPO_ROOT, failGate, passGate, readFileSync, walk } from "./_common.mjs";
import { join } from "node:path";

// v2.3 §5.1 + §5.2 tables whose schema includes org_id. `organizations` is the
// tenant root: its tenant key is `id` itself.
const ORG_KEYED = [
  "organizations",
  "branches",
  "users",
  "user_branch_assignments",
  "students",
  "student_instructor_assignments",
  "worksheets",
  "manual_error_entries",
  "subscriptions",
  "audit_log",
  "hypothesis_evidence",
  "hypothesis_aggregate_observation",
  "student_hypothesis_state",
  "state_recommendation",
  "hypothesis_state_audit",
  "state_recommendation_audit",
  "diagnostic_runs",
  "diagnostic_run_audit",
];

// Tenant data reached via a parent row; spec schema defines no org_id column.
const JOIN_SCOPED = ["worksheet_items", "results", "error_profile", "diagnostics", "reports"];

// Global by spec design: shared corpus (§5.2 items, §7.8), review queue
// (§5.2 — request_payload is the §7.3 contract and carries no student PII),
// curriculum reference data (§6, not tenant-scoped).
const GLOBAL = ["items", "review_queue", "kanji_teach_grade", "kanji_jouyou", "kanji_reading_stage", "lexical_reading_rule", "hypothesis_master"];

const sqlFiles = walk(join(REPO_ROOT, "db", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const sql = sqlFiles.map((f) => readFileSync(f, "utf8")).join("\n");

// --- Parse cumulative schema state across all migrations -------------------
const tables = new Map(); // name -> { columns:Set, rls:boolean, policies:number }

function table(name) {
  if (!tables.has(name)) tables.set(name, { columns: new Set(), rls: false, forceRls: false, policies: 0 });
  return tables.get(name);
}

let m;
const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\)\s*;/gi;
while ((m = createRe.exec(sql)) !== null) {
  const t = table(m[1].toLowerCase());
  for (const line of m[2].split("\n")) {
    const col = line.trim().match(/^([a-z_][a-z0-9_]*)\s/i);
    if (col) t.columns.add(col[1].toLowerCase());
  }
}
const alterAddRe = /alter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi;
while ((m = alterAddRe.exec(sql)) !== null) {
  table(m[1].toLowerCase()).columns.add(m[2].toLowerCase());
}
const rlsRe = /alter\s+table\s+([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
while ((m = rlsRe.exec(sql)) !== null) {
  table(m[1].toLowerCase()).rls = true;
}
const forceRlsRe = /alter\s+table\s+([a-z_][a-z0-9_]*)\s+force\s+row\s+level\s+security/gi;
while ((m = forceRlsRe.exec(sql)) !== null) {
  table(m[1].toLowerCase()).forceRls = true;
}
// Policies: capture the USING clause body so vacuous policies can be flagged
// (issue #6 item 3) — bare existence of a CREATE POLICY is not protection.
const policyRe = /create\s+policy\s+[a-z0-9_]+\s+on\s+([a-z_][a-z0-9_]*)([\s\S]*?);/gi;
const weakPolicies = [];
while ((m = policyRe.exec(sql)) !== null) {
  const name = m[1].toLowerCase();
  table(name).policies += 1;
  const body = m[2];
  const usingMatch = body.match(/using\s*\(([\s\S]*)\)/i);
  const usingClause = usingMatch ? usingMatch[1].trim() : "";
  // A tenant policy must actually consult the session tenant. `using (true)`,
  // an empty clause, or any clause that never references current_org_id() is
  // suspiciously permissive — flag it as a failure rather than counting it.
  if (!/current_org_id\s*\(\s*\)/i.test(usingClause)) {
    weakPolicies.push(
      `policy on '${name}' has a suspiciously permissive USING clause (${JSON.stringify(usingClause.slice(0, 60) || "<none>")}) — it never consults current_org_id() (§16.1; issue #6 item 3)`,
    );
  }
}
// Composite org-integrity FKs (issue #6 blocking issue 2): capture every
// `foreign key (x, org_id) references t (id, org_id)` inside each ALTER TABLE
// statement (one statement may add several constraints).
const compositeFks = new Map(); // table -> Set("col->ref")
const alterStmtRe = /alter\s+table\s+([a-z_][a-z0-9_]*)([\s\S]*?);/gi;
while ((m = alterStmtRe.exec(sql)) !== null) {
  const name = m[1].toLowerCase();
  const body = m[2];
  const fkRe = /foreign\s+key\s*\(\s*([a-z_][a-z0-9_]*)\s*,\s*org_id\s*\)\s*references\s+([a-z_][a-z0-9_]*)\s*\(\s*id\s*,\s*org_id\s*\)/gi;
  let fk;
  while ((fk = fkRe.exec(body)) !== null) {
    if (!compositeFks.has(name)) compositeFks.set(name, new Set());
    compositeFks.get(name).add(`${fk[1].toLowerCase()}->${fk[2].toLowerCase()}`);
  }
}

// --- Assertions ------------------------------------------------------------
const errors = [...weakPolicies];
const classified = new Set([...ORG_KEYED, ...JOIN_SCOPED, ...GLOBAL]);

// Required composite org-integrity FKs (issue #6 blocking issue 2): each
// assignment-table reference must be tied to (id, org_id) on its target so a
// row's org_id provably matches every referenced entity's org_id.
const REQUIRED_COMPOSITE_FKS = {
  user_branch_assignments: ["user_id->users", "branch_id->branches"],
  student_instructor_assignments: ["student_id->students", "user_id->users"],
};
for (const [name, required] of Object.entries(REQUIRED_COMPOSITE_FKS)) {
  const present = compositeFks.get(name) ?? new Set();
  for (const fk of required) {
    if (!present.has(fk)) {
      errors.push(
        `table '${name}' lacks composite FK (${fk.replace("->", ", org_id) -> ")}(id, org_id)) — ` +
          `without it a row's org_id can point at another tenant's entities (issue #6 blocking issue 2; §15.4/§16.1)`,
      );
    }
  }
}

for (const name of tables.keys()) {
  if (!classified.has(name)) {
    errors.push(
      `table '${name}' is not classified in the §15.4 gate — add it to ORG_KEYED, JOIN_SCOPED, or GLOBAL with a spec citation. Unclassified tables fail the build; nothing is skipped silently.`,
    );
  }
}
for (const name of classified) {
  if (!tables.has(name)) {
    errors.push(`classified table '${name}' was not found in any migration — classification is stale or a migration is missing`);
  }
}

for (const name of ORG_KEYED) {
  const t = tables.get(name);
  if (!t) continue;
  const tenantKey = name === "organizations" ? "id" : "org_id";
  if (!t.columns.has(tenantKey)) {
    errors.push(`tenant table '${name}' lacks its tenant key column '${tenantKey}' (v2.3 §5.1/§16.1)`);
  }
  if (!t.rls) errors.push(`tenant table '${name}' does not enable row level security (§16.1)`);
  if (!t.forceRls) errors.push(`tenant table '${name}' does not FORCE row level security — its table owner could bypass tenant isolation (§16.1)`);
  if (t.policies === 0) errors.push(`tenant table '${name}' has no RLS policy — an explicit org-scoped policy is required (§16.1)`);
}
for (const name of JOIN_SCOPED) {
  const t = tables.get(name);
  if (!t) continue;
  if (!t.rls) errors.push(`join-scoped tenant table '${name}' does not enable row level security (§16.1)`);
  if (!t.forceRls) errors.push(`join-scoped tenant table '${name}' does not FORCE row level security — its table owner could bypass tenant isolation (§16.1)`);
  if (t.policies === 0) errors.push(`join-scoped tenant table '${name}' has no RLS policy (§16.1)`);
}
for (const name of GLOBAL) {
  const t = tables.get(name);
  if (!t) continue;
  if (t.columns.has("org_id")) {
    errors.push(`table '${name}' is classified GLOBAL but has an org_id column — reclassify it in this gate (with spec citation) instead of leaving the classification stale`);
  }
}

if (errors.length > 0) {
  failGate("Tenant Isolation Gate", "§15.4", errors);
}
passGate(
  "Tenant Isolation Gate",
  "§15.4",
  `${ORG_KEYED.length} org-keyed + ${JOIN_SCOPED.length} join-scoped tables verified (org_id/RLS/FORCE RLS/non-vacuous policy), ` +
    `${GLOBAL.length} global tables confirmed unscoped by spec design; composite org-integrity FKs present on both assignment tables. ` +
    `Live assignment WRITE isolation and hypothesis-state READ/WRITE isolation are regression-tested in CI against real Postgres.`,
);
