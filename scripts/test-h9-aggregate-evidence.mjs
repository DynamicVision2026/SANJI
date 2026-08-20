#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { persistH9AggregateEvidence } from "../src/hypotheses/persist-h9-aggregate-evidence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const admin = new pg.Client({ connectionString: DB_URL });
let appPool;
let failures = 0;
const pass = (name) => console.log(`  ✓ ${name}`);
const fail = (name, detail) => { failures += 1; console.error(`  ✗ ${name}: ${detail}`); };

try { await admin.connect(); }
catch (error) {
  console.error(`✗ cannot connect to Postgres at ${DB_URL.replace(/:[^:@/]+@/, ":***@")} — ${error.message}`);
  process.exit(1);
}

const files = readdirSync(join(ROOT, "db/migrations")).filter((name) => name.endsWith(".sql")).sort();
const migrate = (name) => admin.query(readFileSync(join(ROOT, "db/migrations", name), "utf8"));

try {
  await admin.query("drop schema public cascade; create schema public;");
  await admin.query("drop role if exists h9_aggregate_writer");
  for (const file of files.filter((name) => name < "0012_hypothesis_aggregate_observation.sql")) await migrate(file);

  const seedTenant = async (suffix) => {
    const org = (await admin.query("insert into organizations(name, plan_tier) values ($1, 'pilot') returning id", [`org-${suffix}`])).rows[0].id;
    const branch = (await admin.query("insert into branches(org_id, name) values ($1, $2) returning id", [org, `branch-${suffix}`])).rows[0].id;
    const user = (await admin.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}@example.test`])).rows[0].id;
    const student = (await admin.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id", [org, branch, `student-${suffix}`])).rows[0].id;
    return { org, branch, user, student };
  };
  const A = await seedTenant("h9-a");
  const B = await seedTenant("h9-b");
  const legacyEvidence = (await admin.query(
    `insert into hypothesis_evidence
       (org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji, weight, source_kind, observed_at)
     values ($1, $2, $3, 'H1', 'legacy-h1', '橋', 1, 'probe_item', now()) returning id`,
    [A.org, A.branch, A.student],
  )).rows[0].id;

  await migrate("0012_hypothesis_aggregate_observation.sql");
  const legacy = (await admin.query("select source_type, aggregate_observation_id from hypothesis_evidence where id = $1", [legacyEvidence])).rows[0];
  if (legacy?.source_type === "result" && legacy.aggregate_observation_id === null) pass("0012 preserves existing row-derived evidence as source_type=result");
  else fail("0012 migration preserves existing evidence", JSON.stringify(legacy));

  await admin.query("create role h9_aggregate_writer login password 'h9_aggregate_writer'");
  await admin.query("grant usage on schema public to h9_aggregate_writer");
  await admin.query("grant select on students, users, hypothesis_aggregate_observation, hypothesis_evidence to h9_aggregate_writer");
  await admin.query("grant insert on hypothesis_aggregate_observation, hypothesis_evidence to h9_aggregate_writer");
  const appUrl = new URL(DB_URL);
  appUrl.username = "h9_aggregate_writer";
  appUrl.password = "h9_aggregate_writer";
  appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });

  const input = (tenant, overrides = {}) => ({
    orgId: tenant.org,
    branchId: tenant.branch,
    studentId: tenant.student,
    actorUserId: tenant.user,
    kanji: "橋",
    readingId: null,
    windowStart: "2026-06-21",
    windowEnd: "2026-08-19",
    recognitionAttempts: 5,
    recognitionCorrect: 5,
    productionAttempts: 5,
    productionCorrect: 2,
    minSourceFactor: 0.4,
    ...overrides,
  });
  const env = { APP_ENV: "development" };
  const created = await persistH9AggregateEvidence(appPool, input(A), env);
  const rows = (await admin.query(
    `select e.*, o.recognition_attempts, o.production_attempts
     from hypothesis_evidence e join hypothesis_aggregate_observation o on o.id = e.aggregate_observation_id
     where e.id = $1`,
    [created.evidence?.id],
  )).rows;
  if (created.evidence?.inserted && rows.length === 1 && rows[0].hypothesis_id === "H9"
      && rows[0].source_type === "aggregate" && rows[0].source_record_id === null
      && Number(rows[0].weight) === 0.4 && rows[0].recognition_attempts === 5 && rows[0].production_attempts === 5) {
    pass("qualifying 60-day aggregate writes exactly one H9 evidence row with no result source");
  } else fail("qualifying aggregate write", JSON.stringify({ created, rows }));

  const repeated = await persistH9AggregateEvidence(appPool, input(A), env);
  const counts = (await admin.query(
    "select (select count(*) from hypothesis_aggregate_observation where student_id = $1)::int observations, (select count(*) from hypothesis_evidence where hypothesis_id = 'H9' and student_id = $1)::int evidence",
    [A.student],
  )).rows[0];
  if (!repeated.evidence?.inserted && repeated.observationId === created.observationId && counts.observations === 1 && counts.evidence === 1) pass("same logical evaluation window is idempotent");
  else fail("aggregate idempotency", JSON.stringify({ repeated, counts }));

  const belowFloor = await persistH9AggregateEvidence(appPool, input(A, {
    kanji: "川", windowStart: "2026-04-22", windowEnd: "2026-06-20",
    productionAttempts: 4, productionCorrect: 0,
  }), env);
  const symmetric = await persistH9AggregateEvidence(appPool, input(A, {
    kanji: "山", windowStart: "2026-02-21", windowEnd: "2026-04-21",
    productionCorrect: 5,
  }), env);
  if (belowFloor.evidence === null && symmetric.evidence === null) pass("hard sample floor and no-asymmetry controls write no H9 evidence");
  else fail("negative aggregate controls", JSON.stringify({ belowFloor, symmetric }));

  try {
    await persistH9AggregateEvidence(appPool, { ...input(A), studentId: B.student }, env);
    fail("cross-tenant aggregate subject read is rejected", "unexpected success");
  } catch { pass("cross-tenant aggregate subject read is rejected under tenant GUC/RLS"); }

  const app = await appPool.connect();
  try {
    await app.query("begin");
    await app.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.user]);
    await app.query(
      `insert into hypothesis_aggregate_observation
         (id, student_id, org_id, hypothesis_id, kanji, window_start, window_end,
          recognition_attempts, recognition_correct, production_attempts, production_correct, gap, min_source_factor)
       values (gen_random_uuid(), $1, $2, 'H9', '橋', '2026-01-01', '2026-03-01', 5, 5, 5, 2, 0.6, 0.4)`,
      [B.student, B.org],
    );
    fail("cross-tenant aggregate write is rejected", "unexpected success");
  } catch (error) {
    if (error.code === "42501") pass("cross-tenant aggregate write is rejected by RLS");
    else fail("cross-tenant aggregate write is rejected", `${error.code}: ${error.message}`);
  } finally {
    await app.query("rollback");
    app.release();
  }

  try {
    await persistH9AggregateEvidence(appPool, input(A, { recognitionCorrect: 6 }), env);
    fail("malformed aggregate is rejected", "unexpected success");
  } catch {
    const count = (await admin.query("select count(*)::int count from hypothesis_aggregate_observation where student_id = $1 and kanji = '橋'", [A.student])).rows[0].count;
    if (count === 1) pass("malformed aggregate rolls back without a partial row");
    else fail("malformed aggregate leaves no partial row", `rows=${count}`);
  }

  const forbidden = (await admin.query(
    `select
       (select count(*) from hypothesis_evidence where hypothesis_id <> 'H1' and hypothesis_id <> 'H9')::int other_evidence,
       (select count(*) from student_hypothesis_state)::int states,
       (select count(*) from state_recommendation)::int recommendations`,
  )).rows[0];
  if (forbidden.other_evidence === 0 && forbidden.states === 0 && forbidden.recommendations === 0) pass("H9 evaluation writes no other hypothesis, state, or recommendation rows");
  else fail("H9 scope boundary", JSON.stringify(forbidden));
} finally {
  if (appPool) await appPool.end();
  await admin.end();
}

if (failures) process.exit(1);
console.log("\nH9 aggregate-evidence integration: PASS");
