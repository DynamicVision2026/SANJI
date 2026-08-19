#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const client = new pg.Client({ connectionString: DB_URL });
let failures = 0;

const pass = (name) => console.log(`  ✓ ${name}`);
const fail = (name, detail) => { failures += 1; console.error(`  ✗ ${name}: ${detail}`); };

async function succeeds(name, sql, params = []) {
  try { const result = await client.query(sql, params); pass(name); return result; }
  catch (error) { fail(name, error.message); return undefined; }
}

async function rejects(name, sql, params = [], codes = []) {
  try { await client.query(sql, params); fail(name, "database accepted an operation that must be rejected"); }
  catch (error) {
    if (codes.length === 0 || codes.includes(error.code)) pass(name);
    else fail(name, `unexpected SQLSTATE ${error.code}: ${error.message}`);
  }
}

try { await client.connect(); }
catch (error) {
  console.error(`✗ cannot connect to Postgres at ${DB_URL.replace(/:[^:@/]+@/, ":***@")} — ${error.message}`);
  process.exit(1);
}

try {
  await client.query("drop schema public cascade; create schema public;");
  for (const file of readdirSync(join(ROOT, "db/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(join(ROOT, "db/migrations", file), "utf8"));
  }

  const seed = async (suffix) => {
    const org = (await client.query("insert into organizations(name, plan_tier) values ($1, 'pilot') returning id", [`org-${suffix}`])).rows[0].id;
    const branch = (await client.query("insert into branches(org_id, name) values ($1, $2) returning id", [org, `branch-${suffix}`])).rows[0].id;
    const user = (await client.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}@example.test`])).rows[0].id;
    const student = (await client.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id", [org, branch, `student-${suffix}`])).rows[0].id;
    await client.query("insert into student_instructor_assignments(student_id, user_id, org_id, active) values ($1, $2, $3, true)", [student, user, org]);
    return { org, branch, user, student };
  };
  const A = await seed("a");
  const B = await seed("b");

  const state = (await client.query("insert into student_hypothesis_state(org_id, branch_id, student_id, hypothesis_id) values ($1, $2, $3, 'H1') returning id", [A.org, A.branch, A.student])).rows[0].id;
  await client.query("insert into student_hypothesis_state(org_id, branch_id, student_id, hypothesis_id) values ($1, $2, $3, 'H1')", [B.org, B.branch, B.student]);

  await rejects("invalid state enum is rejected", "insert into student_hypothesis_state(org_id, branch_id, student_id, hypothesis_id, status) values ($1, $2, $3, 'H2', 'watching')", [A.org, A.branch, A.student], ["23514"]);
  await rejects("new state cannot skip undetected", "insert into student_hypothesis_state(org_id, branch_id, student_id, hypothesis_id, status) values ($1, $2, $3, 'H2', 'active')", [A.org, A.branch, A.student], ["23514"]);
  await rejects("direct state mutation is rejected", "update student_hypothesis_state set status = 'active' where id = $1", [state], ["42501"]);
  await rejects("confirmed state cannot be silently deleted", "delete from student_hypothesis_state where id = $1", [state], ["42501"]);

  await succeeds("H1 evidence is durable", "insert into hypothesis_evidence(org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji, weight, source_kind, observed_at) values ($1, $2, $3, 'H1', 'h1-a', '字', 3, 'probe_item', now())", [A.org, A.branch, A.student]);
  const unchanged = await client.query("select status from student_hypothesis_state where id = $1", [state]);
  if (unchanged.rows[0].status === "undetected") pass("H1-H9 evidence cannot automatically mutate confirmed state");
  else fail("H1-H9 evidence cannot automatically mutate confirmed state", unchanged.rows[0].status);
  await rejects("evidence history is immutable", "update hypothesis_evidence set weight = 4 where evidence_key = 'h1-a'", [], ["42501"]);

  await rejects("empty recommendation basis is rejected", "insert into state_recommendation(org_id, branch_id, student_id, hypothesis_id, from_status, to_status, basis) values ($1, $2, $3, 'H1', 'undetected', 'active', '{}')", [A.org, A.branch, A.student], ["23514"]);
  await rejects("no-op recommendation is rejected", "insert into state_recommendation(org_id, branch_id, student_id, hypothesis_id, from_status, to_status, basis) values ($1, $2, $3, 'H1', 'undetected', 'undetected', '{\"evidence_ids\":[\"h1-a\"]}')", [A.org, A.branch, A.student], ["23514"]);
  await rejects("stale from_status recommendation is rejected", "insert into state_recommendation(org_id, branch_id, student_id, hypothesis_id, from_status, to_status, basis) values ($1, $2, $3, 'H1', 'active', 'remediating', '{\"weighted_sum\":3}')", [A.org, A.branch, A.student], ["23514"]);
  const recommendation = (await client.query("insert into state_recommendation(org_id, branch_id, student_id, hypothesis_id, from_status, to_status, basis) values ($1, $2, $3, 'H1', 'undetected', 'active', '{\"evidence_kanji\":[\"字\"],\"weighted_sum\":3}') returning id", [A.org, A.branch, A.student])).rows[0].id;
  await rejects("only one pending recommendation is allowed", "insert into state_recommendation(org_id, branch_id, student_id, hypothesis_id, from_status, to_status, basis) values ($1, $2, $3, 'H1', 'undetected', 'remediating', '{\"weighted_sum\":4}')", [A.org, A.branch, A.student], ["23505"]);
  await rejects("resolution fields cannot be forged", "update state_recommendation set resolution = 'approved', resolved_by_user_id = $2, resolved_at = now() where id = $1", [recommendation, A.user], ["42501"]);
  await client.query("select set_config('app.current_org', $1, false), set_config('app.current_user', $2, false)", [A.org, A.user]);
  await rejects("cross-tenant actor cannot approve", "select resolve_state_recommendation($1, $2, 'approved')", [recommendation, B.user], ["42501"]);

  await client.query("create role sanji_tenant_test nologin");
  await client.query("grant usage on schema public to sanji_tenant_test");
  await client.query("grant select, insert, update, delete on hypothesis_evidence, student_hypothesis_state, state_recommendation, hypothesis_state_audit, state_recommendation_audit to sanji_tenant_test");
  await client.query("set role sanji_tenant_test");
  await client.query("select set_config('app.current_org', $1, false)", [A.org]);
  const visible = await client.query("select count(*)::int count from student_hypothesis_state");
  if (visible.rows[0].count === 1) pass("cross-tenant state reads are filtered by RLS");
  else fail("cross-tenant state reads are filtered by RLS", `visible rows=${visible.rows[0].count}`);
  await rejects("cross-tenant evidence write is rejected by RLS", "insert into hypothesis_evidence(org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji, weight, source_kind, observed_at) values ($1, $2, $3, 'H1', 'h1-b', '字', 1, 'probe_item', now())", [B.org, B.branch, B.student], ["42501"]);
  await rejects("app role with INSERT cannot forge state audit", "insert into hypothesis_state_audit(org_id, state_id, recommendation_id, student_id, hypothesis_id, from_status, to_status, approved_by_user_id) values ($1, $2, $3, $4, 'H1', 'undetected', 'active', $5)", [A.org, state, recommendation, A.student, A.user], ["42501"]);
  await rejects("app role with INSERT cannot forge recommendation audit", "insert into state_recommendation_audit(org_id, recommendation_id, action, actor_user_id, basis_snapshot) values ($1, $2, 'approved', $3, '{\"forged\":true}')", [A.org, recommendation, A.user], ["42501"]);
  await client.query("reset role");

  await client.query("create role sanji_table_owner nologin");
  await client.query("alter table student_hypothesis_state owner to sanji_table_owner");
  await client.query("grant usage on schema public to sanji_table_owner");
  await client.query("set role sanji_table_owner");
  await client.query("select set_config('app.current_org', $1, false)", [A.org]);
  const ownerVisible = await client.query("select count(*)::int count from student_hypothesis_state");
  if (ownerVisible.rows[0].count === 1) pass("FORCE RLS filters cross-tenant reads even for the table owner");
  else fail("FORCE RLS filters cross-tenant reads even for the table owner", `visible rows=${ownerVisible.rows[0].count}`);
  await client.query("reset role");

  await succeeds("explicit assigned-instructor approval succeeds", "select resolve_state_recommendation($1, $2, 'approved')", [recommendation, A.user]);
  const approved = await client.query("select status, version from student_hypothesis_state where id = $1", [state]);
  if (approved.rows[0].status === "active" && approved.rows[0].version === "2") pass("approval changes state exactly once");
  else fail("approval changes state exactly once", JSON.stringify(approved.rows[0]));
  await rejects("approval capability cannot be reused for a second direct mutation", "update student_hypothesis_state set status = 'remediating' where id = $1", [state], ["42501"]);
  const audit = await client.query("select count(*)::int count from hypothesis_state_audit where recommendation_id = $1", [recommendation]);
  if (audit.rows[0].count === 1) pass("approved transition has one durable audit row");
  else fail("approved transition has one durable audit row", `count=${audit.rows[0].count}`);
  await rejects("state audit history is immutable", "delete from hypothesis_state_audit where recommendation_id = $1", [recommendation], ["42501"]);
  await rejects("recommendation cannot be resolved twice", "select resolve_state_recommendation($1, $2, 'approved')", [recommendation, A.user], ["P0002"]);

  const rejectedState = (await client.query("insert into student_hypothesis_state(org_id, branch_id, student_id, hypothesis_id) values ($1, $2, $3, 'H2') returning id", [A.org, A.branch, A.student])).rows[0].id;
  const rejectedRecommendation = (await client.query("insert into state_recommendation(org_id, branch_id, student_id, hypothesis_id, from_status, to_status, basis) values ($1, $2, $3, 'H2', 'undetected', 'active', '{\"weighted_sum\":3}') returning id", [A.org, A.branch, A.student])).rows[0].id;
  await succeeds("explicit rejection succeeds", "select resolve_state_recommendation($1, $2, 'rejected', 'insufficient classroom context')", [rejectedRecommendation, A.user]);
  const rejectedOutcome = await client.query("select status from student_hypothesis_state where id = $1", [rejectedState]);
  const rejectedAudit = await client.query("select action, rejection_note from state_recommendation_audit where recommendation_id = $1", [rejectedRecommendation]);
  if (rejectedOutcome.rows[0].status === "undetected" && rejectedAudit.rows[0].action === "rejected" && rejectedAudit.rows[0].rejection_note === "insufficient classroom context") pass("rejection leaves state unchanged and is attributable");
  else fail("rejection leaves state unchanged and is attributable", JSON.stringify({ state: rejectedOutcome.rows[0], audit: rejectedAudit.rows[0] }));

  const h8Snapshot = JSON.parse(readFileSync(join(ROOT, "src/curriculum/data/h8_candidate_snapshot.json"), "utf8"));
  const h8Generated = JSON.parse(readFileSync(join(ROOT, "src/curriculum/data/h8_candidates.generated.json"), "utf8"));
  const unreviewedOnly = h8Snapshot.status === "PENDING_HUMAN_PRUNING" && [...h8Generated, ...h8Snapshot.curated_starting_pairs].every((candidate) => candidate.decision === "pending" && candidate.reviewer === null && candidate.reviewed_at === null);
  if (unreviewedOnly) pass("unreviewed H8 candidates remain pending and have no admission record");
  else fail("unreviewed H8 candidates remain pending and have no admission record", "candidate asset contains an unreviewed admission");
} finally {
  await client.end();
}

if (failures) process.exit(1);
console.log("\nhypothesis persistence: PASS");
