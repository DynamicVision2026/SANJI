#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { persistH1Evidence } from "../src/hypotheses/persist-h1-evidence.ts";
import { persistH2Evidence } from "../src/hypotheses/persist-h2-evidence.ts";
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

const migrationFiles = readdirSync(join(ROOT, "db/migrations")).filter((name) => name.endsWith(".sql")).sort();
const applyMigration = (name) => admin.query(readFileSync(join(ROOT, "db/migrations", name), "utf8"));

try {
  await admin.query("drop schema public cascade; create schema public;");
  await admin.query("drop role if exists h1_evidence_writer");
  for (const file of migrationFiles.filter((name) => name < "0011_result_source_kind.sql")) await applyMigration(file);

  const seedTenant = async (suffix) => {
    const org = (await admin.query("insert into organizations(name, plan_tier) values ($1, 'pilot') returning id", [`org-${suffix}`])).rows[0].id;
    const branch = (await admin.query("insert into branches(org_id, name) values ($1, $2) returning id", [org, `branch-${suffix}`])).rows[0].id;
    const user = (await admin.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}@example.test`])).rows[0].id;
    const student = (await admin.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id", [org, branch, `student-${suffix}`])).rows[0].id;
    return { org, branch, user, student };
  };
  const A = await seedTenant("a");
  const oldItem = (await admin.query("insert into items(item_type, target_kanji, answer_text) values ('yomi', '宮', 'みや') returning id")).rows[0].id;
  const oldWorksheet = (await admin.query("insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'graded') returning id", [A.org, A.branch, A.student, A.user])).rows[0].id;
  await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [oldWorksheet, oldItem]);
  const oldResult = (await admin.query("insert into results(worksheet_id, item_id, student_id, is_correct, wrong_answer_text, graded_at, graded_by_user_id) values ($1, $2, $3, false, 'むぐ', now(), $4) returning id", [oldWorksheet, oldItem, A.student, A.user])).rows[0].id;

  await applyMigration("0011_result_source_kind.sql");
  await applyMigration("0017_result_response_text.sql");
  const column = (await admin.query("select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'results' and column_name = 'source_kind'")).rows[0];
  const responseColumn = (await admin.query("select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'results' and column_name = 'response_text'")).rows[0];
  const oldStored = (await admin.query("select source_kind, response_text, wrong_answer_text from results where id = $1", [oldResult])).rows[0];
  if (column?.is_nullable === "YES" && column.column_default === null && oldStored?.source_kind === null
      && responseColumn?.is_nullable === "YES" && responseColumn.column_default === null
      && oldStored.response_text === null && oldStored.wrong_answer_text === "むぐ") {
    pass("0011/0017 add nullable columns without defaults/backfill and preserve legacy rows");
  } else fail("0011 migration is additive and safe", JSON.stringify({ column, oldStored }));

  const B = await seedTenant("b");
  await admin.query("insert into kanji_jouyou(kanji, in_kyoiku) values ('宮', true)");
  const readingRows = (await admin.query(
    `insert into kanji_reading_stage
       (kanji, reading_kana, reading_type, school_stage, elementary_grade, source_page, is_jukujikun, confidence)
     values
       ('宮', 'みや', 'kun', 'elementary', 3, 9, false, 'high'),
       ('宮', 'キュウ', 'on', 'elementary', 3, 9, false, 'high'),
       ('宮', 'グウ', 'on', 'junior_high', 3, 9, false, 'high')
     returning id, reading_kana`,
  )).rows;
  const readingIds = Object.fromEntries(readingRows.map(({ id, reading_kana }) => [reading_kana, id]));

  await admin.query("create role h1_evidence_writer login password 'h1_evidence_writer'");
  await admin.query("grant usage on schema public to h1_evidence_writer");
  await admin.query("grant select on students, users, worksheets, worksheet_items, items, results, kanji_reading_stage, hypothesis_evidence to h1_evidence_writer");
  await admin.query("grant insert on results, hypothesis_evidence to h1_evidence_writer");
  const appUrl = new URL(DB_URL);
  appUrl.username = "h1_evidence_writer";
  appUrl.password = "h1_evidence_writer";
  appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 8 });
  await admin.query("update results set source_kind = 'probe_item' where id = $1", [oldResult]);

  const makeResult = async (tenant, { itemType = "yomi", target = "宮", answer = "みや", targetReadingId = null, response = "むぐ", responseText, sourceKind = "probe_item" } = {}) => {
    const item = (await admin.query("insert into items(item_type, target_kanji, answer_text, target_reading_id) values ($1, $2, $3, $4) returning id", [itemType, target, answer, targetReadingId])).rows[0].id;
    const worksheet = (await admin.query("insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id", [tenant.org, tenant.branch, tenant.student, tenant.user])).rows[0].id;
    await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [worksheet, item]);
    const recorded = await recordResult(appPool, {
      orgId: tenant.org, branchId: tenant.branch, studentId: tenant.student,
      worksheetId: worksheet, itemId: item, gradedByUserId: tenant.user,
      isCorrect: false, wrongAnswerText: response, gradedAt: new Date("2026-08-19T00:00:00.000Z"),
      ...(responseText === undefined ? {} : { responseText }),
    });
    if (sourceKind !== null) await admin.query("update results set source_kind = $1 where id = $2", [sourceKind, recorded.id]);
    return recorded.id;
  };
  const context = (tenant, resultId) => ({ orgId: tenant.org, branchId: tenant.branch, studentId: tenant.student, resultId, actorUserId: tenant.user });

  const legacyEvidence = await persistH1Evidence(appPool, context(A, oldResult));
  if (legacyEvidence?.inserted) pass("legacy row falls back to wrong_answer_text for H1 evaluation");
  else fail("legacy row remains interpretable by H1", JSON.stringify(legacyEvidence));

  const yomiId = await makeResult(A);
  const yomiEvidence = await persistH1Evidence(appPool, context(A, yomiId));
  const yomiStored = (await admin.query("select * from hypothesis_evidence where source_record_id = $1", [yomiId])).rows;
  if (yomiEvidence?.inserted && yomiStored.length === 1 && Number(yomiStored[0].weight) === 1 && yomiStored[0].evidence_key === `${yomiId}:H1` && yomiStored[0].org_id === A.org && yomiStored[0].branch_id === A.branch) {
    pass("unmatched yomi result writes one tenant-scoped H1 row at weight 1.0 with composite key");
  } else fail("unmatched yomi result writes correct H1 evidence", JSON.stringify({ yomiEvidence, yomiStored }));

  const repeated = await persistH1Evidence(appPool, context(A, yomiId));
  const repeatedCount = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id = $1 and hypothesis_id = 'H1'", [yomiId])).rows[0].count;
  if (repeated && !repeated.inserted && repeated.id === yomiEvidence.id && repeatedCount === 1) pass("re-submission is idempotent for (result.id, H1)");
  else fail("re-submission is idempotent", JSON.stringify({ repeated, repeatedCount }));

  const kakitoriId = await makeResult(A, { itemType: "kakitori", answer: "宮", response: "官" });
  await persistH1Evidence(appPool, context(A, kakitoriId));
  const kakitoriEvidence = (await admin.query("select hypothesis_id, weight from hypothesis_evidence where source_record_id = $1", [kakitoriId])).rows;
  if (kakitoriEvidence.length === 1 && kakitoriEvidence[0].hypothesis_id === "H1" && Number(kakitoriEvidence[0].weight) === 0.5) pass("unmatched kakitori writes H1 weight 0.5 and fabricates no H9 row");
  else fail("kakitori H1/H9 boundary", JSON.stringify(kakitoriEvidence));

  const elementaryId = await makeResult(A, { response: "キュウ" });
  const juniorHighId = await makeResult(A, { response: "グウ" });
  const nonReadingId = await makeResult(A, { response: "むぐ" });
  const threeCases = [
    await persistH1Evidence(appPool, context(A, elementaryId)),
    await persistH1Evidence(appPool, context(A, juniorHighId)),
    await persistH1Evidence(appPool, context(A, nonReadingId)),
  ];
  if (threeCases[0] === null && threeCases[1]?.inserted && threeCases[2]?.inserted) pass("H2 coarse-stage exclusion covers elementary / junior-high / non-reading controls");
  else fail("H2 coarse-stage three-case control", JSON.stringify(threeCases));

  const noResponseId = await makeResult(A, { response: null, responseText: null });
  const blankId = await makeResult(A, { response: null, responseText: "  " });
  const noSourceId = await makeResult(A, { sourceKind: null });
  if (await persistH1Evidence(appPool, context(A, noResponseId)) === null
      && await persistH1Evidence(appPool, context(A, blankId)) === null
      && await persistH1Evidence(appPool, context(A, noSourceId)) === null) {
    const skipped = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id in ($1, $2, $3)", [noResponseId, blankId, noSourceId])).rows[0].count;
    if (skipped === 0) pass("H1 confirmed blank, not-captured response, and NULL source independently write no evidence");
    else fail("NULL gates write no evidence", `rows=${skipped}`);
  } else fail("NULL gates return no evidence", "adapter returned evidence");

  const bResult = await makeResult(B);
  try {
    await persistH1Evidence(appPool, { ...context(A, bResult), studentId: B.student });
    fail("cross-tenant result read is rejected", "read unexpectedly succeeded");
  } catch { pass("cross-tenant result read is rejected by tenant-scoped lookup/RLS"); }

  const appClient = await appPool.connect();
  try {
    await appClient.query("begin");
    await appClient.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.user]);
    await appClient.query("insert into hypothesis_evidence(org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji, weight, source_kind, source_record_id, observed_at) values ($1, $2, $3, 'H1', $4, '宮', 1, 'probe_item', $5, now())", [B.org, B.branch, B.student, `${bResult}:H1`, bResult]);
    fail("cross-tenant evidence write is rejected", "write unexpectedly succeeded");
  } catch (error) {
    if (error.code === "42501") pass("cross-tenant hypothesis_evidence write is rejected by RLS");
    else fail("cross-tenant hypothesis_evidence write is rejected", `${error.code}: ${error.message}`);
  } finally {
    await appClient.query("rollback");
    appClient.release();
  }

  const malformedId = await makeResult(A, { sourceKind: "invented_source" });
  try {
    await persistH1Evidence(appPool, context(A, malformedId));
    fail("unsupported source_kind fails cleanly", "write unexpectedly succeeded");
  } catch {
    const count = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id = $1", [malformedId])).rows[0].count;
    if (count === 0) pass("unsupported source_kind rolls back without a partial evidence row");
    else fail("unsupported source_kind writes no partial row", `rows=${count}`);
  }

  const h2Id = await makeResult(A, { targetReadingId: readingIds["みや"], response: "キュウ" });
  const h2Evidence = await persistH2Evidence(appPool, context(A, h2Id));
  const h2Stored = (await admin.query("select * from hypothesis_evidence where source_record_id = $1 and hypothesis_id = 'H2'", [h2Id])).rows;
  if (h2Evidence?.inserted && h2Stored.length === 1 && Number(h2Stored[0].weight) === 1 && h2Stored[0].evidence_key === `${h2Id}:H2`) pass("source-backed opposite on/kun result writes one H2 row at source weight 1.0");
  else fail("H2 positive result writes correct evidence", JSON.stringify({ h2Evidence, h2Stored }));

  const h2Repeated = await persistH2Evidence(appPool, context(A, h2Id));
  const h2RepeatedCount = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id = $1 and hypothesis_id = 'H2'", [h2Id])).rows[0].count;
  if (h2Repeated && !h2Repeated.inserted && h2Repeated.id === h2Evidence.id && h2RepeatedCount === 1) pass("H2 re-submission is idempotent for (result.id, H2)");
  else fail("H2 re-submission is idempotent", JSON.stringify({ h2Repeated, h2RepeatedCount }));

  const h2UnknownId = await makeResult(A, { targetReadingId: readingIds["みや"], response: "むぐ" });
  if (await persistH2Evidence(appPool, context(A, h2UnknownId)) === null) pass("H1-like unknown reading is not misclassified as H2");
  else fail("H2 negative control", "unknown reading produced evidence");

  const h2NoResponseId = await makeResult(A, { targetReadingId: readingIds["みや"], response: null, responseText: null });
  const h2BlankId = await makeResult(A, { targetReadingId: readingIds["みや"], response: null, responseText: "  " });
  const h2NoSourceId = await makeResult(A, { targetReadingId: readingIds["みや"], response: "キュウ", sourceKind: null });
  if (await persistH2Evidence(appPool, context(A, h2NoResponseId)) === null
      && await persistH2Evidence(appPool, context(A, h2BlankId)) === null
      && await persistH2Evidence(appPool, context(A, h2NoSourceId)) === null) {
    const skipped = (await admin.query("select count(*)::int count from hypothesis_evidence where hypothesis_id = 'H2' and source_record_id in ($1, $2, $3)", [h2NoResponseId, h2BlankId, h2NoSourceId])).rows[0].count;
    if (skipped === 0) pass("H2 confirmed blank, not-captured response, and NULL source independently write no evidence");
    else fail("H2 NULL gates write no evidence", `rows=${skipped}`);
  } else fail("H2 NULL gates return no evidence", "adapter returned evidence");

  const bH2Result = await makeResult(B, { targetReadingId: readingIds["みや"], response: "キュウ" });
  try {
    await persistH2Evidence(appPool, { ...context(A, bH2Result), studentId: B.student });
    fail("cross-tenant H2 result read is rejected", "read unexpectedly succeeded");
  } catch { pass("cross-tenant H2 result read is rejected by tenant-scoped lookup/RLS"); }

  const h2WriteClient = await appPool.connect();
  try {
    await h2WriteClient.query("begin");
    await h2WriteClient.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.user]);
    await h2WriteClient.query("insert into hypothesis_evidence(org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji, weight, source_kind, source_record_id, observed_at) values ($1, $2, $3, 'H2', $4, '宮', 1, 'probe_item', $5, now())", [B.org, B.branch, B.student, `${bH2Result}:H2`, bH2Result]);
    fail("cross-tenant H2 evidence write is rejected", "write unexpectedly succeeded");
  } catch (error) {
    if (error.code === "42501") pass("cross-tenant H2 evidence write is rejected by RLS");
    else fail("cross-tenant H2 evidence write is rejected", `${error.code}: ${error.message}`);
  } finally {
    await h2WriteClient.query("rollback");
    h2WriteClient.release();
  }

  const forbiddenWrites = (await admin.query("select (select count(*) from student_hypothesis_state)::int states, (select count(*) from state_recommendation)::int recommendations")).rows[0];
  const otherHypotheses = (await admin.query("select count(*)::int count from hypothesis_evidence where hypothesis_id not in ('H1', 'H2')")).rows[0].count;
  if (forbiddenWrites.states === 0 && forbiddenWrites.recommendations === 0 && otherHypotheses === 0) pass("H1/H2 wiring touches neither state, recommendations, nor any other hypothesis");
  else fail("H1/H2 wiring stays inside its evidence boundary", JSON.stringify({ ...forbiddenWrites, otherHypotheses }));
} finally {
  if (appPool) await appPool.end();
  await admin.end();
}

if (failures) process.exit(1);
console.log("\nH1/H2 result-to-evidence integration: PASS");
