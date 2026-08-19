#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, failGate, passGate } from "./gates/_common.mjs";

const sql = readFileSync(join(REPO_ROOT, "db/migrations/0010_hypothesis_persistence.sql"), "utf8");
const errors = [];
const requiredTables = [
  "hypothesis_master",
  "hypothesis_evidence",
  "student_hypothesis_state",
  "state_recommendation",
  "hypothesis_state_audit",
  "state_recommendation_audit",
];

for (const table of requiredTables) {
  if (!new RegExp(`create\\s+table\\s+${table}\\b`, "i").test(sql)) errors.push(`missing table ${table}`);
}
for (const table of requiredTables.slice(1)) {
  if (!new RegExp(`alter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql)) {
    errors.push(`${table} does not enable RLS`);
  }
}
for (const token of [
  "state_recommendation_one_pending_idx",
  "student_hypothesis_state_guard",
  "hypothesis_evidence_immutable",
  "resolve_state_recommendation",
  "resolved_by_user_id",
  "approved_by_user_id",
]) {
  if (!sql.includes(token)) errors.push(`missing safety mechanism ${token}`);
}

if (errors.length) failGate("Hypothesis Persistence Schema", "v2.5 §7A.1/§7A.8/§11.10/§15.8", errors);
passGate(
  "Hypothesis Persistence Schema",
  "v2.5 §7A.1/§7A.8/§11.10/§15.8",
  "tenant-owned evidence, confirmed state, recommendations, and immutable audit records are present; direct state mutation is guarded",
);

