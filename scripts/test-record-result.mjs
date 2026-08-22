#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { recordResult } from "../src/results/record-result.ts";

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
  await admin.query("drop role if exists result_writer");
  for (const file of readdirSync(join(ROOT, "db/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(join(ROOT, "db/migrations", file), "utf8"));
  }

  const seedTenant = async (suffix) => {
    const org = (await admin.query("insert into organizations(name, plan_tier) values ($1, 'pilot') returning id", [`org-${suffix}`])).rows[0].id;
    const branch = (await admin.query("insert into branches(org_id, name) values ($1, $2) returning id", [org, `branch-${suffix}`])).rows[0].id;
    const user = (await admin.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}@example.test`])).rows[0].id;
    const student = (await admin.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id", [org, branch, `student-${suffix}`])).rows[0].id;
    const item = (await admin.query("insert into items(item_type, target_kanji, answer_text) values ('kakitori', $1, $1) returning id", [suffix === "a" ? "字" : "文"])).rows[0].id;
    const worksheet = (await admin.query("insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id", [org, branch, student, user])).rows[0].id;
    await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [worksheet, item]);
    return { org, branch, user, student, item, worksheet };
  };
  const A = await seedTenant("a");
  const B = await seedTenant("b");

  await admin.query("create role result_writer login password 'result_writer'");
  await admin.query("grant usage on schema public to result_writer");
  await admin.query("grant select on students, worksheets, worksheet_items, users, results to result_writer");
  await admin.query("grant insert on results to result_writer");
  const appUrl = new URL(DB_URL);
  appUrl.username = "result_writer";
  appUrl.password = "result_writer";
  appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 12 });

  const event = (tenant, overrides = {}) => ({
    orgId: tenant.org,
    branchId: tenant.branch,
    studentId: tenant.student,
    worksheetId: tenant.worksheet,
    itemId: tenant.item,
    gradedByUserId: tenant.user,
    isCorrect: false,
    wrongAnswerText: "学",
    gradedAt: new Date("2026-08-19T00:00:00.000Z"),
    ...overrides,
  });
  const newTarget = async (kanji) => {
    const item = (await admin.query("insert into items(item_type, target_kanji, answer_text) values ('kakitori', $1, $1) returning id", [kanji])).rows[0].id;
    const worksheet = (await admin.query("insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id", [A.org, A.branch, A.student, A.user])).rows[0].id;
    await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [worksheet, item]);
    return { worksheetId: worksheet, itemId: item };
  };

  const recorded = await recordResult(appPool, event(A, { sourceKind: "targeted_practice" }));
  const stored = await admin.query(
    "select r.*, s.org_id, s.branch_id from results r join students s on s.id = r.student_id where r.id = $1",
    [recorded.id],
  );
  if (recorded.inserted && stored.rowCount === 1 && stored.rows[0].org_id === A.org && stored.rows[0].branch_id === A.branch && stored.rows[0].wrong_answer_text === "学" && stored.rows[0].source_kind === "targeted_practice") {
    pass("valid sourceKind is persisted in the tenant-scoped result transaction");
  } else fail("valid sourceKind is persisted in the tenant-scoped result transaction", JSON.stringify({ recorded, stored: stored.rows }));

  const correctTarget = await newTarget("正");
  const correct = await recordResult(appPool, event(A, {
    ...correctTarget, isCorrect: true, wrongAnswerText: null, responseText: " か\u3099く ",
  }));
  const incorrectTarget = await newTarget("誤");
  const incorrect = await recordResult(appPool, event(A, {
    ...incorrectTarget, wrongAnswerText: "がく", responseText: " か\u3099く ",
  }));
  const blankTarget = await newTarget("空");
  const blank = await recordResult(appPool, event(A, {
    ...blankTarget, wrongAnswerText: null, responseText: " \t ",
  }));
  const uncapturedTarget = await newTarget("無");
  const uncaptured = await recordResult(appPool, event(A, {
    ...uncapturedTarget, wrongAnswerText: null, responseText: null,
  }));
  const responseRows = (await admin.query(
    "select id, is_correct, response_text, wrong_answer_text from results where id = any($1::uuid[])",
    [[correct.id, incorrect.id, blank.id, uncaptured.id]],
  )).rows;
  const byId = Object.fromEntries(responseRows.map((row) => [row.id, row]));
  if (byId[correct.id]?.is_correct && byId[correct.id].response_text === "がく" && byId[correct.id].wrong_answer_text === null
      && !byId[incorrect.id]?.is_correct && byId[incorrect.id].response_text === "がく" && byId[incorrect.id].wrong_answer_text === "がく"
      && byId[blank.id]?.response_text === "" && byId[blank.id].wrong_answer_text === null
      && byId[uncaptured.id]?.response_text === null && byId[uncaptured.id].wrong_answer_text === null) {
    pass("response_text distinguishes normalized correct, incorrect, confirmed blank, and not-captured responses");
  } else fail("response_text capture contract", JSON.stringify(responseRows));

  const conflictTarget = await newTarget("争");
  const beforeConflict = (await admin.query("select count(*)::int count from results")).rows[0].count;
  try {
    await recordResult(appPool, event(A, { ...conflictTarget, wrongAnswerText: "がく", responseText: "まなぶ" }));
    fail("conflicting response fields fail loudly", "write unexpectedly succeeded");
  } catch (error) {
    const afterConflict = (await admin.query("select count(*)::int count from results")).rows[0].count;
    if (/responseText conflicts/.test(error.message) && afterConflict === beforeConflict) pass("conflicting response fields fail before any partial result row");
    else fail("conflicting response fields rollback", `${error.message}; before=${beforeConflict}, after=${afterConflict}`);
  }

  const nullSourceItem = (await admin.query("insert into items(item_type, target_kanji, answer_text) values ('kakitori', '話', '話') returning id")).rows[0].id;
  const nullSourceWorksheet = (await admin.query("insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id", [A.org, A.branch, A.student, A.user])).rows[0].id;
  await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [nullSourceWorksheet, nullSourceItem]);
  const nullSource = await recordResult(appPool, event(A, { worksheetId: nullSourceWorksheet, itemId: nullSourceItem }));
  const nullSourceStored = await admin.query("select source_kind from results where id = $1", [nullSource.id]);
  if (nullSourceStored.rows[0]?.source_kind === null) pass("absent sourceKind persists as valid NULL provenance");
  else fail("absent sourceKind persists as valid NULL provenance", JSON.stringify(nullSourceStored.rows));

  const beforeInvalid = (await admin.query("select count(*)::int count from results")).rows[0].count;
  try {
    await recordResult(appPool, event(A, {
      worksheetId: nullSourceWorksheet,
      itemId: nullSourceItem,
      sourceKind: "invented_source",
    }));
    fail("invalid sourceKind is rejected", "write unexpectedly succeeded");
  } catch (error) {
    const afterInvalid = (await admin.query("select count(*)::int count from results")).rows[0].count;
    if (/sourceKind is unsupported/.test(error.message) && afterInvalid === beforeInvalid) pass("invalid sourceKind is rejected before any row is written");
    else fail("invalid sourceKind is rejected before any row is written", `${error.message}; before=${beforeInvalid}, after=${afterInvalid}`);
  }

  try {
    await recordResult(appPool, event(B, { orgId: A.org, branchId: A.branch, gradedByUserId: A.user }));
    fail("cross-tenant write is rejected", "write unexpectedly succeeded");
  } catch {
    const count = await admin.query("select count(*)::int count from results where student_id = $1", [B.student]);
    if (count.rows[0].count === 0) pass("cross-tenant write is rejected without a partial row");
    else fail("cross-tenant write is rejected without a partial row", `rows=${count.rows[0].count}`);
  }

  try {
    await recordResult(appPool, event(A, { itemId: "00000000-0000-4000-8000-000000000000" }));
    fail("incomplete worksheet-item input is rejected", "write unexpectedly succeeded");
  } catch {
    const after = (await admin.query("select count(*)::int count from results where student_id = $1", [A.student])).rows[0].count;
    if (after === beforeInvalid) pass("incomplete input rolls back without a partial row");
    else fail("incomplete input rolls back without a partial row", `before=${beforeInvalid}, after=${after}`);
  }

  const concurrentItem = (await admin.query("insert into items(item_type, target_kanji, answer_text) values ('kakitori', '語', '語') returning id")).rows[0].id;
  const concurrentWorksheet = (await admin.query("insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id", [A.org, A.branch, A.student, A.user])).rows[0].id;
  await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [concurrentWorksheet, concurrentItem]);
  const concurrentEvent = event(A, { worksheetId: concurrentWorksheet, itemId: concurrentItem, isCorrect: true, wrongAnswerText: null });
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => recordResult(appPool, concurrentEvent)));
  const concurrentRows = await admin.query("select count(*)::int count from results where worksheet_id = $1 and item_id = $2 and student_id = $3", [concurrentWorksheet, concurrentItem, A.student]);
  if (concurrentRows.rows[0].count === 1 && new Set(concurrent.map(({ id }) => id)).size === 1 && concurrent.filter(({ inserted }) => inserted).length === 1) {
    pass("concurrent identical calls produce one durable, uncorrupted row");
  } else fail("concurrent identical calls produce one durable, uncorrupted row", JSON.stringify({ calls: concurrent, rows: concurrentRows.rows[0].count }));

  const hypothesisWrites = await admin.query("select (select count(*) from hypothesis_evidence)::int evidence, (select count(*) from student_hypothesis_state)::int states, (select count(*) from state_recommendation)::int recommendations");
  if (Object.values(hypothesisWrites.rows[0]).every((count) => count === 0)) pass("result recording touches no hypothesis-layer table");
  else fail("result recording touches no hypothesis-layer table", JSON.stringify(hypothesisWrites.rows[0]));
} finally {
  if (appPool) await appPool.end();
  await admin.end();
}

if (failures) process.exit(1);
console.log("\nresult recording: PASS");
