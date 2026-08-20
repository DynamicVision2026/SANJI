#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { generateValidatedItem, insertGeneratedItem, assertDistractorShape } from "../src/items/generation-pipeline.ts";
import { persistH1Evidence } from "../src/hypotheses/persist-h1-evidence.ts";
import { recordResult } from "../src/results/record-result.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const admin = new pg.Client({ connectionString: DB_URL });
let appPool;

const scripted = {
  name: "ci-scripted-l1",
  generate: async (prompt) => prompt.startsWith("Return exactly SAFE")
    ? { text: "SAFE", model: "ci-scripted-safety" }
    : { text: JSON.stringify({ body_text: "川の水の深さを測る。", answer_text: "はかる", blank_position: 7 }), model: "ci-captured-gpt-5.6-sol-output" },
};

try {
  await admin.connect();
  await admin.query("drop schema public cascade; create schema public;");
  await admin.query("drop role if exists track_a_writer");
  for (const file of readdirSync(join(ROOT, "db/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(join(ROOT, "db/migrations", file), "utf8"));
  }

  await admin.query("insert into kanji_jouyou(kanji, in_kyoiku) values ('測', true)");
  const readingRows = (await admin.query(
    `insert into kanji_reading_stage
       (kanji, reading_kana, reading_type, school_stage, elementary_grade, source_page, is_jukujikun, confidence)
     values
       ('測', 'はかる', 'kun', 'elementary', 5, 34, false, 'high'),
       ('測', 'ソク', 'on', 'elementary', 5, 34, false, 'high'),
       ('測', 'サク', 'on', 'junior_high', 5, 34, false, 'high')
     returning id, reading_kana`,
  )).rows;
  const readingIds = Object.fromEntries(readingRows.map(({ id, reading_kana }) => [reading_kana, Number(id)]));

  const org = (await admin.query("insert into organizations(name, plan_tier) values ('track-a-org', 'pilot') returning id")).rows[0].id;
  const branch = (await admin.query("insert into branches(org_id, name) values ($1, 'track-a-branch') returning id", [org])).rows[0].id;
  const user = (await admin.query("insert into users(org_id, email, role, status) values ($1, 'track-a@example.test', 'instructor', 'active') returning id", [org])).rows[0].id;
  const student = (await admin.query("insert into students(org_id, branch_id, display_name, grade, status) values ($1, $2, 'trace-student', 5, 'active') returning id", [org, branch])).rows[0].id;

  await admin.query("create role track_a_writer login password 'track_a_writer'");
  await admin.query("grant usage on schema public to track_a_writer");
  await admin.query("grant select on hypothesis_master, kanji_reading_stage, students, users, worksheets, worksheet_items, items, results, hypothesis_evidence to track_a_writer");
  await admin.query("grant insert on items, results, hypothesis_evidence to track_a_writer");
  const appUrl = new URL(DB_URL);
  appUrl.username = "track_a_writer";
  appUrl.password = "track_a_writer";
  appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 5 });

  const request = {
    grade: 5, kanken_level: 6, allowed_bare: ["川", "水", "深", "測"], allowed_with_ruby: [],
    target_kanji: "測", target_reading_ids: [readingIds["はかる"]], item_type: "yomi",
    span_role_profile: "target", diagnostic_objective: "probe", target_hypotheses: ["H1", "H2"],
    contrast_kanji: null, topic_hint: "川", exclude_item_ids: [], cohort_exclude_item_ids: [],
  };
  const generated = await generateValidatedItem({
    database: appPool, provider: scripted, safetyProvider: scripted, request,
    pii: { kind: "tenantless", attestation: "caller-attests-no-tenant-data-in-scope" },
  });
  const itemId = await insertGeneratedItem(appPool, generated);

  const storedItem = (await admin.query(
    "select target_reading_ids, distractors, discriminates, lexical_surface, okurigana_rule_id from items where id = $1",
    [itemId],
  )).rows[0];
  if (
    storedItem.target_reading_ids.map(Number)[0] !== readingIds["はかる"] ||
    storedItem.distractors[0].ref_id !== readingIds["ソク"] ||
    storedItem.lexical_surface !== null || storedItem.okurigana_rule_id !== null
  ) throw new Error(`five-field persistence mismatch: ${JSON.stringify(storedItem)}`);

  const worksheet = (await admin.query(
    "insert into worksheets(org_id, branch_id, student_id, created_by_user_id, status) values ($1, $2, $3, $4, 'generated') returning id",
    [org, branch, student, user],
  )).rows[0].id;
  await admin.query("insert into worksheet_items(worksheet_id, item_id, position) values ($1, $2, 1)", [worksheet, itemId]);
  const response = "タイミング";
  const recorded = await recordResult(appPool, {
    orgId: org, branchId: branch, studentId: student, worksheetId: worksheet, itemId,
    gradedByUserId: user, isCorrect: false, wrongAnswerText: response,
    gradedAt: new Date("2026-08-20T00:00:00.000Z"), sourceKind: "probe_item",
  });
  const evidence = await persistH1Evidence(appPool, { orgId: org, branchId: branch, studentId: student, resultId: recorded.id, actorUserId: user });
  const storedResult = (await admin.query("select source_kind from results where id = $1", [recorded.id])).rows[0];
  const storedEvidence = (await admin.query("select hypothesis_id, evidence_key, weight from hypothesis_evidence where source_record_id = $1", [recorded.id])).rows[0];
  if (!evidence?.inserted || storedResult.source_kind !== "probe_item" || storedEvidence.hypothesis_id !== "H1") {
    throw new Error(`trace classification mismatch: ${JSON.stringify({ evidence, storedResult, storedEvidence })}`);
  }

  const outOfStage = structuredClone(generated);
  outOfStage.distractors = [{ surface: "サク", hypothesis: "H2", basis: "reading_table", ref_id: readingIds["サク"] }];
  try {
    await insertGeneratedItem(appPool, outOfStage);
    throw new Error("out-of-stage distractor was accepted");
  } catch (error) {
    if (!String(error.message).includes("out-of-stage distractor")) throw error;
  }
  try {
    assertDistractorShape({ surface: "未", hypothesis: "H8", basis: "confusable_pair", ref_id: null });
    throw new Error("curated null ref_id was accepted");
  } catch (error) {
    if (!String(error.message).includes("ref_id is required")) throw error;
  }

  console.log("Track A generation-to-H1 integration: PASS");
  console.log(JSON.stringify({
    generator: generated.model_used, body_text: generated.body_text, answer_text: generated.answer_text,
    response, target_kanji: generated.target_kanji, classification: storedEvidence.hypothesis_id,
    certainty: "PERSISTED_EVIDENCE", source_kind: storedResult.source_kind,
  }, null, 2));
  console.log("  ✓ out-of-stage reading-table distractor rejected");
  console.log("  ✓ curated distractor without ref_id rejected");
} finally {
  if (appPool) await appPool.end();
  await admin.end();
}
