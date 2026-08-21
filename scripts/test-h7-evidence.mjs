#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { persistH7Evidence } from "../src/hypotheses/persist-h7-evidence.ts";
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
  await admin.query("drop role if exists h7_evidence_writer");
  for (const file of readdirSync(join(ROOT, "db/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(join(ROOT, "db/migrations", file), "utf8"));
  }

  const seedTenant = async (suffix) => {
    const org = (await admin.query("insert into organizations(name, plan_tier) values ($1, 'pilot') returning id", [`org-${suffix}`])).rows[0].id;
    const branch = (await admin.query("insert into branches(org_id, name) values ($1, $2) returning id", [org, `branch-${suffix}`])).rows[0].id;
    const user = (await admin.query("insert into users(org_id, email, role, status) values ($1, $2, 'instructor', 'active') returning id", [org, `${suffix}@example.test`])).rows[0].id;
    const student = (await admin.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, $3, 3, 'active') returning id", [org, branch, `student-${suffix}`])).rows[0].id;
    return { org, branch, user, student };
  };
  const A = await seedTenant("h7-a");
  const B = await seedTenant("h7-b");

  await admin.query("create role h7_evidence_writer login password 'h7_evidence_writer'");
  await admin.query("grant usage on schema public to h7_evidence_writer");
  await admin.query("grant select on students, users, worksheets, worksheet_items, items, results, hypothesis_evidence to h7_evidence_writer");
  await admin.query("grant insert on results, hypothesis_evidence to h7_evidence_writer");
  const appUrl = new URL(DB_URL);
  appUrl.username = "h7_evidence_writer";
  appUrl.password = "h7_evidence_writer";
  appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 6 });

  const makeResult = async (tenant, {
    target = "今", surface = "今日", answer = "きょう", response = "いまひ",
    sourceKind = "probe_item", itemType = "yomi",
  } = {}) => {
    const item = (await admin.query(
      "insert into items(item_type, target_kanji, answer_text, lexical_surface) values ($1, $2, $3, $4) returning id",
      [itemType, target, answer, surface],
    )).rows[0].id;
    const worksheet = (await admin.query(
      "insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id",
      [tenant.org, tenant.branch, tenant.student, tenant.user],
    )).rows[0].id;
    await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [worksheet, item]);
    const recorded = await recordResult(appPool, {
      orgId: tenant.org, branchId: tenant.branch, studentId: tenant.student,
      worksheetId: worksheet, itemId: item, gradedByUserId: tenant.user,
      isCorrect: false, wrongAnswerText: response, gradedAt: new Date("2026-08-20T00:00:00.000Z"),
      ...(sourceKind === null ? {} : { sourceKind }),
    });
    return recorded.id;
  };
  const context = (tenant, resultId) => ({
    orgId: tenant.org, branchId: tenant.branch, studentId: tenant.student,
    resultId, actorUserId: tenant.user,
  });

  const positiveId = await makeResult(A);
  const positive = await persistH7Evidence(appPool, context(A, positiveId));
  const stored = (await admin.query("select * from hypothesis_evidence where source_record_id = $1", [positiveId])).rows;
  if (positive?.inserted && stored.length === 1 && stored[0].hypothesis_id === "H7"
      && stored[0].evidence_key === `${positiveId}:H7` && Number(stored[0].weight) === 1
      && stored[0].org_id === A.org && stored[0].branch_id === A.branch) {
    pass("closed-set compositional response writes one tenant-scoped H7 row");
  } else fail("positive H7 evidence mapping", JSON.stringify({ positive, stored }));

  const repeated = await persistH7Evidence(appPool, context(A, positiveId));
  const repeatedCount = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id = $1 and hypothesis_id = 'H7'", [positiveId])).rows[0].count;
  if (repeated && !repeated.inserted && repeated.id === positive.id && repeatedCount === 1) pass("re-evaluation is idempotent for (result.id, H7)");
  else fail("H7 idempotency", JSON.stringify({ repeated, repeatedCount }));

  const unknownId = await makeResult(A, { response: "でたらめ" });
  const variantId = await makeResult(A, { target: "明", surface: "明日", answer: "あす", response: "あした" });
  if (await persistH7Evidence(appPool, context(A, unknownId)) === null
      && await persistH7Evidence(appPool, context(A, variantId)) === null) {
    const count = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id in ($1, $2)", [unknownId, variantId])).rows[0].count;
    if (count === 0) pass("unclassified response and admitted 明日/あした variant create no H7 evidence");
    else fail("negative controls write no rows", `rows=${count}`);
  } else fail("negative H7 controls", "adapter returned evidence");

  const noResponseId = await makeResult(A, { response: null });
  const noSourceId = await makeResult(A, { sourceKind: null });
  const skipped = [
    await persistH7Evidence(appPool, context(A, noResponseId)),
    await persistH7Evidence(appPool, context(A, noSourceId)),
  ];
  const skippedCount = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id in ($1, $2)", [noResponseId, noSourceId])).rows[0].count;
  if (skipped.every((value) => value === null) && skippedCount === 0) pass("NULL response and NULL source_kind independently skip H7 evidence");
  else fail("H7 skip gates", JSON.stringify({ skipped, skippedCount }));

  const unsupportedSourceId = await makeResult(A, { sourceKind: "aggregate" });
  try {
    await persistH7Evidence(appPool, context(A, unsupportedSourceId));
    fail("unsupported non-null source_kind fails loudly", "evaluation unexpectedly succeeded");
  } catch (error) {
    const count = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id = $1", [unsupportedSourceId])).rows[0].count;
    if (error.message === "result source_kind is unsupported" && count === 0) pass("unsupported non-null source_kind rolls back without H7 evidence");
    else fail("unsupported source_kind error and rollback", JSON.stringify({ message: error.message, count }));
  }

  const malformedId = await makeResult(A, { surface: null });
  try {
    await persistH7Evidence(appPool, context(A, malformedId));
    fail("incomplete H7 item fails cleanly", "evaluation unexpectedly succeeded");
  } catch {
    const count = (await admin.query("select count(*)::int count from hypothesis_evidence where source_record_id = $1", [malformedId])).rows[0].count;
    if (count === 0) pass("incomplete H7 item rolls back without a partial evidence row");
    else fail("malformed H7 input writes no partial row", `rows=${count}`);
  }

  const bResult = await makeResult(B);
  try {
    await persistH7Evidence(appPool, { ...context(A, bResult), studentId: B.student });
    fail("cross-tenant H7 result read is rejected", "read unexpectedly succeeded");
  } catch { pass("cross-tenant H7 result read is rejected under tenant GUC/RLS"); }

  const writeClient = await appPool.connect();
  try {
    await writeClient.query("begin");
    await writeClient.query("select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)", [A.org, A.user]);
    await writeClient.query(
      "insert into hypothesis_evidence(org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji, weight, source_kind, source_record_id, observed_at) values ($1, $2, $3, 'H7', $4, '今', 1, 'probe_item', $5, now())",
      [B.org, B.branch, B.student, `${bResult}:H7`, bResult],
    );
    fail("cross-tenant H7 evidence write is rejected", "write unexpectedly succeeded");
  } catch (error) {
    if (error.code === "42501") pass("cross-tenant H7 evidence write is rejected by RLS");
    else fail("cross-tenant H7 evidence write is rejected", `${error.code}: ${error.message}`);
  } finally {
    await writeClient.query("rollback");
    writeClient.release();
  }

  const forbidden = (await admin.query("select (select count(*) from student_hypothesis_state)::int states, (select count(*) from state_recommendation)::int recommendations, (select count(*) from hypothesis_evidence where hypothesis_id <> 'H7')::int other_evidence")).rows[0];
  if (forbidden.states === 0 && forbidden.recommendations === 0 && forbidden.other_evidence === 0) pass("H7 adapter touches neither state, recommendations, nor another hypothesis");
  else fail("H7 evidence boundary", JSON.stringify(forbidden));
} finally {
  if (appPool) await appPool.end();
  await admin.end();
}

if (failures) process.exit(1);
console.log("\nH7 result-to-evidence integration: PASS");
