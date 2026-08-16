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
];

// Tenant data reached via a parent row; spec schema defines no org_id column.
const JOIN_SCOPED = ["worksheet_items", "results", "error_profile", "diagnostics", "reports"];

// Global by spec design: shared corpus (§5.2 items, §7.8), review queue
// (§5.2 — request_payload is the §7.3 contract and carries no student PII),
// curriculum reference data (§6, not tenant-scoped).
const GLOBAL = ["items", "review_queue", "kanji_teach_grade", "kanji_reading_stage", "lexical_reading_rule"];

const sqlFiles = walk(join(REPO_ROOT, "db", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const sql = sqlFiles.map((f) => readFileSync(f, "utf8")).join("\n");

// --- Parse cumulative schema state across all migrations -------------------
const tables = new Map(); // name -> { columns:Set, rls:boolean, policies:number }

function table(name) {
  if (!tables.has(name)) tables.set(name, { columns: new Set(), rls: false, policies: 0 });
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
const policyRe = /create\s+policy\s+[a-z0-9_]+\s+on\s+([a-z_][a-z0-9_]*)/gi;
while ((m = policyRe.exec(sql)) !== null) {
  table(m[1].toLowerCase()).policies += 1;
}

// --- Assertions ------------------------------------------------------------
const errors = [];
const classified = new Set([...ORG_KEYED, ...JOIN_SCOPED, ...GLOBAL]);

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
  if (t.policies === 0) errors.push(`tenant table '${name}' has no RLS policy — an explicit org-scoped policy is required (§16.1)`);
}
for (const name of JOIN_SCOPED) {
  const t = tables.get(name);
  if (!t) continue;
  if (!t.rls) errors.push(`join-scoped tenant table '${name}' does not enable row level security (§16.1)`);
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
  `${ORG_KEYED.length} org-keyed + ${JOIN_SCOPED.length} join-scoped tables verified (org_id/RLS/policy), ${GLOBAL.length} global tables confirmed unscoped by spec design; every discovered table classified. Live cross-tenant read tests land with auth hardening (Week 9, §18.1).`,
);
