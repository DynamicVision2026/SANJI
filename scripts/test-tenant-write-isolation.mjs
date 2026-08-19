#!/usr/bin/env node
/**
 * §15.4 live write-isolation regression test (issue #6 blocking issue 2).
 *
 * Round-1's gap: RLS on the assignment tables checked the row's OWN org_id —
 * a value the writer supplies — so an org-A actor could insert an assignment
 * row with org_id = A whose user_id/branch_id/student_id pointed at org-B
 * rows. This test attacks exactly that path against a REAL Postgres:
 *
 *   1. applies every migration in db/migrations in order,
 *   2. seeds two orgs (A, B) with a user/branch/student each,
 *   3. asserts same-org assignments INSERT fine,
 *   4. attempts each cross-tenant insertion shape and asserts Postgres
 *      rejects the WRITE itself (SQLSTATE 23503 foreign_key_violation from
 *      the 0007 composite FKs) — not merely that RLS hides a read,
 *   5. attempts an UPDATE that re-points a valid row across tenants and
 *      asserts that is rejected too.
 *
 * Connection: DATABASE_URL, else postgres://postgres:postgres@127.0.0.1:5432/postgres
 * (matching the CI service container). An unreachable database FAILS the test
 * — an isolation test that silently skips is worthless (§15.4 rationale).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const client = new pg.Client({ connectionString: DB_URL });
let failures = 0;

function pass(name) {
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failures += 1;
  console.error(`  ✗ ${name}: ${detail}`);
}

async function mustSucceed(name, sql, params) {
  try {
    await client.query(sql, params);
    pass(name);
  } catch (error) {
    fail(name, `legitimate same-org write was rejected: ${error.message}`);
  }
}

async function mustRejectFk(name, sql, params) {
  try {
    await client.query(sql, params);
    fail(name, "cross-tenant write was ACCEPTED by the database — the 0007 constraints are not effective");
  } catch (error) {
    if (error.code === "23503") {
      pass(name);
    } else {
      // Rejected, but not by the composite FK — still investigate.
      fail(name, `rejected with unexpected SQLSTATE ${error.code}: ${error.message}`);
    }
  }
}

try {
  await client.connect();
} catch (error) {
  console.error(
    `✗ cannot connect to Postgres at ${DB_URL.replace(/:[^:@/]+@/, ":***@")} — ${error.message}\n` +
      "  This test requires a live database (CI provides a postgres service container; " +
      "locally: initdb/pg_ctl or docker). A skipped isolation test proves nothing, so this is a FAILURE.",
  );
  process.exit(1);
}

try {
  // Fresh schema each run.
  await client.query("drop schema public cascade; create schema public;");

  const migrations = readdirSync(join(ROOT, "db", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await client.query(readFileSync(join(ROOT, "db", "migrations", file), "utf8"));
  }
  console.log(`applied ${migrations.length} migrations: ${migrations.join(", ")}`);

  // Seed two tenants. (Superuser connection — RLS is not what's under test
  // here; the composite FKs must hold even for connections RLS doesn't bind.)
  const seed = async (name) => {
    const org = (
      await client.query(
        "insert into organizations (name, plan_tier) values ($1, 'pilot') returning id",
        [`org-${name}`],
      )
    ).rows[0].id;
    const branch = (
      await client.query(
        "insert into branches (org_id, name) values ($1, $2) returning id",
        [org, `branch-${name}`],
      )
    ).rows[0].id;
    const user = (
      await client.query(
        "insert into users (org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id",
        [org, `instructor-${name}@example.test`],
      )
    ).rows[0].id;
    const student = (
      await client.query(
        "insert into students (branch_id, org_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id",
        [branch, org, `student-${name}`],
      )
    ).rows[0].id;
    return { org, branch, user, student };
  };
  const A = await seed("A");
  const B = await seed("B");

  console.log("\nsame-org writes (must succeed):");
  await mustSucceed(
    "org-A user↔branch assignment",
    "insert into user_branch_assignments (user_id, branch_id, org_id) values ($1, $2, $3)",
    [A.user, A.branch, A.org],
  );
  await mustSucceed(
    "org-A student↔instructor assignment",
    "insert into student_instructor_assignments (student_id, user_id, org_id, active) values ($1, $2, $3, true)",
    [A.student, A.user, A.org],
  );

  console.log("\ncross-tenant writes (must be rejected with 23503):");
  await mustRejectFk(
    "org-A row referencing org-B branch",
    "insert into user_branch_assignments (user_id, branch_id, org_id) values ($1, $2, $3)",
    [A.user, B.branch, A.org],
  );
  await mustRejectFk(
    "org-A row referencing org-B user",
    "insert into user_branch_assignments (user_id, branch_id, org_id) values ($1, $2, $3)",
    [B.user, A.branch, A.org],
  );
  await mustRejectFk(
    "org-A row referencing org-B student",
    "insert into student_instructor_assignments (student_id, user_id, org_id, active) values ($1, $2, $3, true)",
    [B.student, A.user, A.org],
  );
  await mustRejectFk(
    "org_id spoof: org-A label on all-org-B references",
    "insert into user_branch_assignments (user_id, branch_id, org_id) values ($1, $2, $3)",
    [B.user, B.branch, A.org],
  );
  await mustRejectFk(
    "UPDATE re-pointing a valid org-A row at an org-B branch",
    "update user_branch_assignments set branch_id = $1 where user_id = $2 and org_id = $3",
    [B.branch, A.user, A.org],
  );
  await mustRejectFk(
    "UPDATE re-labelling a valid org-A row as org-B",
    "update user_branch_assignments set org_id = $1 where user_id = $2 and branch_id = $3",
    [B.org, A.user, A.branch],
  );
} finally {
  await client.end();
}

if (failures > 0) {
  console.error(`\ntenant write-isolation: FAILED (${failures})`);
  process.exit(1);
}
console.log("\ntenant write-isolation: PASS — cross-tenant assignment writes are impossible at the database layer");

const hypothesisTest = spawnSync(process.execPath, [join(ROOT, "scripts", "test-hypothesis-persistence.mjs")], {
  env: process.env,
  stdio: "inherit",
});
if (hypothesisTest.status !== 0) process.exit(hypothesisTest.status ?? 1);

const resultTest = spawnSync(
  process.execPath,
  ["--import", "tsx", join(ROOT, "scripts", "test-record-result.mjs")],
  { env: process.env, stdio: "inherit" },
);
if (resultTest.status !== 0) process.exit(resultTest.status ?? 1);

const h1EvidenceTest = spawnSync(
  process.execPath,
  ["--import", "tsx", join(ROOT, "scripts", "test-h1-evidence.mjs")],
  { env: process.env, stdio: "inherit" },
);
if (h1EvidenceTest.status !== 0) process.exit(h1EvidenceTest.status ?? 1);
