#!/usr/bin/env node
/**
 * §15.4 Tenant Isolation Gate — partial real check.
 *
 * Full check (§15.4, when the DB is live, Week 9): automated tests attempt
 * cross-tenant reads at org, branch, and assignment scope and assert failure.
 *
 * Implemented now (static): every tenant table declared in the migrations —
 * i.e. any `create table` that has an `org_id` column — MUST also have
 * `enable row level security`. A tenant table shipped without RLS is a silent
 * cross-tenant leak (§16.1), so we fail the build on one.
 */
import { REPO_ROOT, failGate, passGate, readFileSync, walk } from "./_common.mjs";
import { join } from "node:path";

const migDir = join(REPO_ROOT, "db", "migrations");
const sql = walk(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

// Collect tables: name -> { hasOrgId, rlsEnabled }
const tables = new Map();

// create table [if not exists] <name> ( ... );  — capture name + body
const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\)\s*;/gi;
let m;
while ((m = createRe.exec(sql)) !== null) {
  const name = m[1].toLowerCase();
  const body = m[2];
  const hasOrgId = /\borg_id\b/.test(body);
  tables.set(name, { hasOrgId, rlsEnabled: false });
}

// alter table <name> enable row level security;
const rlsRe = /alter\s+table\s+([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
while ((m = rlsRe.exec(sql)) !== null) {
  const name = m[1].toLowerCase();
  const t = tables.get(name);
  if (t) t.rlsEnabled = true;
}

const tenantTables = [...tables.entries()].filter(([, t]) => t.hasOrgId);
const missing = tenantTables.filter(([, t]) => !t.rlsEnabled).map(([n]) => n);

if (tenantTables.length === 0) {
  failGate("Tenant Isolation Gate", "§15.4", "no tenant (org_id) tables found — migration parsing likely broke");
}
if (missing.length > 0) {
  failGate(
    "Tenant Isolation Gate",
    "§15.4",
    missing.map((n) => `table '${n}' has org_id but no 'enable row level security' (§16.1)`),
  );
}
passGate(
  "Tenant Isolation Gate",
  "§15.4",
  `${tenantTables.length} org-scoped tables all have RLS enabled. Live cross-tenant read tests follow auth hardening (Week 9, §18).`,
);
