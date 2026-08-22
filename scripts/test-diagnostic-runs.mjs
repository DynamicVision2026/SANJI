#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { createDiagnosticRun } from "../src/diagnostics/create-diagnostic-run.ts";

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

try {
  await admin.query("drop schema public cascade; create schema public;");
  await admin.query("drop role if exists diagnostic_run_writer");
  for (const file of readdirSync(join(ROOT, "db/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(join(ROOT, "db/migrations", file), "utf8"));
  }

  const seedTenant = async (suffix) => {
    const org = (await admin.query("insert into organizations(name, plan_tier) values ($1, 'pilot') returning id", [`org-${suffix}`])).rows[0].id;
    const branch = (await admin.query("insert into branches(org_id, name) values ($1, $2) returning id", [org, `branch-${suffix}`])).rows[0].id;
    const instructor = (await admin.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}-assigned@example.test`])).rows[0].id;
    const unassigned = (await admin.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}-unassigned@example.test`])).rows[0].id;
    const student = (await admin.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id", [org, branch, `student-${suffix}`])).rows[0].id;
    await admin.query("insert into user_branch_assignments(user_id, branch_id, org_id) values ($1, $2, $3), ($4, $2, $3)", [instructor, branch, org, unassigned]);
    await admin.query("insert into student_instructor_assignments(student_id, user_id, org_id, active) values ($1, $2, $3, true)", [student, instructor, org]);
    return { org, branch, instructor, unassigned, student };
  };
  const A = await seedTenant("diagnostic-a");
  const B = await seedTenant("diagnostic-b");

  await admin.query("create role diagnostic_run_writer login password 'diagnostic_run_writer'");
  await admin.query("grant usage on schema public to diagnostic_run_writer");
  await admin.query("grant select on users, students, user_branch_assignments, student_instructor_assignments to diagnostic_run_writer");
  await admin.query("grant select, insert on diagnostic_runs to diagnostic_run_writer");
  await admin.query("grant select, insert, update, delete on diagnostic_run_audit to diagnostic_run_writer");
  await admin.query("grant execute on function create_diagnostic_run(uuid, uuid, uuid, uuid) to diagnostic_run_writer");
  const appUrl = new URL(DB_URL);
  appUrl.username = "diagnostic_run_writer";
  appUrl.password = "diagnostic_run_writer";
  appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });

  const request = (tenant, overrides = {}) => ({
    orgId: tenant.org,
    branchId: tenant.branch,
    studentId: tenant.student,
    actorUserId: tenant.instructor,
    ...overrides,
  });

  const created = await createDiagnosticRun(appPool, request(A));
  const boundary = (await admin.query(
    `select r.org_id, r.branch_id, r.student_id, r.initiated_by_user_id, r.status,
            a.actor_user_id, a.action, a.at = r.created_at as timestamps_match
     from diagnostic_runs r join diagnostic_run_audit a on a.run_id = r.id
     where r.id = $1`,
    [created.id],
  )).rows[0];
  if (boundary?.org_id === A.org && boundary.branch_id === A.branch
      && boundary.student_id === A.student && boundary.initiated_by_user_id === A.instructor
      && boundary.status === "created" && boundary.actor_user_id === A.instructor
      && boundary.action === "created" && boundary.timestamps_match) {
    pass("active assigned instructor creates one tenant-scoped run and derived audit event");
  } else fail("assigned instructor run boundary", JSON.stringify(boundary));

  const second = await createDiagnosticRun(appPool, request(A));
  const distinctRuns = (await admin.query(
    "select count(*)::int count from diagnostic_runs where id in ($1, $2)",
    [created.id, second.id],
  )).rows[0].count;
  if (created.id !== second.id && distinctRuns === 2) pass("without a stable caller event key, each authorized invocation creates a distinct run");
  else fail("explicit non-idempotent run contract", JSON.stringify({ created, second, distinctRuns }));

  const beforeDenied = (await admin.query("select (select count(*) from diagnostic_runs)::int runs, (select count(*) from diagnostic_run_audit)::int audits")).rows[0];
  for (const [name, input] of [
    ["same-org unassigned instructor", request(A, { actorUserId: A.unassigned })],
    ["cross-tenant actor", request(A, { actorUserId: B.instructor })],
    ["cross-tenant student and branch", request(A, { branchId: B.branch, studentId: B.student })],
  ]) {
    try {
      await createDiagnosticRun(appPool, input);
      fail(`${name} is rejected`, "creation unexpectedly succeeded");
    } catch (error) {
      if (error.code === "42501") pass(`${name} is rejected loudly`);
      else fail(`${name} is rejected loudly`, `${error.code}: ${error.message}`);
    }
  }
  const afterDenied = (await admin.query("select (select count(*) from diagnostic_runs)::int runs, (select count(*) from diagnostic_run_audit)::int audits")).rows[0];
  if (JSON.stringify(beforeDenied) === JSON.stringify(afterDenied)) pass("authorization failures roll back both run and audit rows");
  else fail("authorization rollback boundary", JSON.stringify({ beforeDenied, afterDenied }));

  const directInsertRejected = async (name, contextActor, rowActor) => {
    const direct = await appPool.connect();
    try {
      await direct.query("begin");
      await direct.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, contextActor]);
      try {
        await direct.query(
          "insert into diagnostic_runs(org_id, branch_id, student_id, initiated_by_user_id) values ($1, $2, $3, $4)",
          [A.org, A.branch, A.student, rowActor],
        );
        fail(name, "direct insert unexpectedly succeeded");
      } catch (error) {
        if (error.code === "42501") pass(name);
        else fail(name, `${error.code}: ${error.message}`);
      }
      await direct.query("rollback");
    } finally { direct.release(); }
  };
  await directInsertRejected("same-tenant unassigned instructor cannot bypass run authorization by direct INSERT", A.unassigned, A.unassigned);
  await directInsertRejected("same-tenant caller cannot forge another actor on a direct run INSERT", A.instructor, A.unassigned);
  const afterDirectDenials = (await admin.query("select (select count(*) from diagnostic_runs)::int runs, (select count(*) from diagnostic_run_audit)::int audits")).rows[0];
  if (JSON.stringify(afterDirectDenials) === JSON.stringify(afterDenied)) pass("direct INSERT authorization failures create neither run nor audit rows");
  else fail("direct INSERT authorization rollback", JSON.stringify({ afterDenied, afterDirectDenials }));

  const malformedBefore = afterDenied;
  try {
    await createDiagnosticRun(appPool, request(A, { studentId: "bad" }));
    fail("malformed input is rejected", "creation unexpectedly succeeded");
  } catch (error) {
    const after = (await admin.query("select (select count(*) from diagnostic_runs)::int runs, (select count(*) from diagnostic_run_audit)::int audits")).rows[0];
    if (/studentId must be a UUID/.test(error.message) && JSON.stringify(after) === JSON.stringify(malformedBefore)) pass("malformed input fails before partial writes");
    else fail("malformed input rollback", `${error.message}; ${JSON.stringify(after)}`);
  }

  const client = await appPool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.instructor]);
    const invisible = await client.query("select id from diagnostic_runs where org_id = $1", [B.org]);
    if (invisible.rowCount === 0) pass("direct cross-tenant run reads are filtered by RLS");
    else fail("direct cross-tenant run reads are filtered by RLS", `rows=${invisible.rowCount}`);
    try {
      await client.query(
        "insert into diagnostic_runs(org_id, branch_id, student_id, initiated_by_user_id) values ($1, $2, $3, $4)",
        [B.org, B.branch, B.student, B.instructor],
      );
      fail("direct cross-tenant run write is rejected", "write unexpectedly succeeded");
    } catch (error) {
      if (error.code === "42501") pass("direct cross-tenant run writes are rejected by RLS");
      else fail("direct cross-tenant run writes are rejected by RLS", `${error.code}: ${error.message}`);
    }
    await client.query("rollback");
  } finally { client.release(); }

  const auditClient = await appPool.connect();
  try {
    await auditClient.query("begin");
    await auditClient.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.instructor]);
    try {
      await auditClient.query(
        "insert into diagnostic_run_audit(org_id, run_id, actor_user_id, action) values ($1, $2, $3, 'created')",
        [A.org, created.id, A.unassigned],
      );
      fail("caller cannot forge diagnostic audit identity", "insert unexpectedly succeeded");
    } catch (error) {
      if (error.code === "42501") pass("caller cannot forge diagnostic audit identity or details");
      else fail("caller cannot forge diagnostic audit identity", `${error.code}: ${error.message}`);
    }
    await auditClient.query("rollback");
  } finally { auditClient.release(); }

  const bRun = await createDiagnosticRun(appPool, request(B));
  const auditReadClient = await appPool.connect();
  try {
    await auditReadClient.query("begin");
    await auditReadClient.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.instructor]);
    const invisibleAudit = await auditReadClient.query("select id from diagnostic_run_audit where run_id = $1", [bRun.id]);
    if (invisibleAudit.rowCount === 0) pass("direct cross-tenant audit reads are filtered by RLS");
    else fail("direct cross-tenant audit reads are filtered by RLS", `rows=${invisibleAudit.rowCount}`);
    await auditReadClient.query("rollback");
  } finally { auditReadClient.release(); }

  await admin.query("alter table diagnostic_run_audit disable trigger diagnostic_run_audit_guard");
  const auditWriteClient = await appPool.connect();
  try {
    await auditWriteClient.query("begin");
    await auditWriteClient.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.instructor]);
    try {
      await auditWriteClient.query(
        "insert into diagnostic_run_audit(org_id, run_id, actor_user_id, action) values ($1, $2, $3, 'created')",
        [B.org, bRun.id, B.instructor],
      );
      fail("direct cross-tenant audit write is rejected by RLS", "write unexpectedly succeeded");
    } catch (error) {
      if (error.code === "42501") pass("direct cross-tenant audit writes are rejected by RLS");
      else fail("direct cross-tenant audit writes are rejected by RLS", `${error.code}: ${error.message}`);
    }
    await auditWriteClient.query("rollback");
  } finally {
    auditWriteClient.release();
    await admin.query("alter table diagnostic_run_audit enable trigger diagnostic_run_audit_guard");
  }

  const forbidden = (await admin.query(`select
    (select count(*) from items)::int items,
    (select count(*) from results)::int results,
    (select count(*) from hypothesis_evidence)::int evidence,
    (select count(*) from student_hypothesis_state)::int states,
    (select count(*) from state_recommendation)::int recommendations`)).rows[0];
  if (Object.values(forbidden).every((count) => count === 0)) pass("diagnostic-run creation touches no item, result, evidence, state, or recommendation table");
  else fail("diagnostic-run scope boundary", JSON.stringify(forbidden));
} finally {
  if (appPool) await appPool.end();
  await admin.end();
}

if (failures) process.exit(1);
console.log("\ndiagnostic-run authorization and audit: PASS");
