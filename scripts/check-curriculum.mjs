#!/usr/bin/env node
/**
 * §6.5 curriculum coverage gate (CI).
 *
 * Runs the frozen §6.5 assertions against src/curriculum/data:
 *   - per-grade counts 80/160/200/202/193/191, total 1,026
 *   - duplicate detection
 *   - checksum over the frozen sorted character set (substitution guard)
 * Plus, since §19.2 data delivery (0008): kanji_jouyou / kanji_reading_stage /
 * lexical_reading_rule structural and FK-integrity checks, and the §15.5
 * classifier regression-set coverage check.
 *
 * This is a REAL gate (not a stub): it exits non-zero on any violation, which
 * is the concrete proof that the CI pipeline can fail the build (issue §1).
 *
 * Implemented in plain ESM (no build step) so CI can run it fast. The assertion
 * logic lives in src/curriculum/ingest.ts; here we re-implement the same
 * checks over the JSON directly to keep the gate dependency-free. The ingest
 * test (npm test) exercises the TypeScript path and asserts they agree.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "src", "curriculum", "data");

const EXPECTED_COUNTS = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
const EXPECTED_TOTAL = 1026;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

const rows = JSON.parse(
  readFileSync(join(DATA_DIR, "kanji_teach_grade.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(join(DATA_DIR, "kanji_teach_grade.checksum.json"), "utf8"),
);

// Duplicate detection.
const seen = new Map();
for (const r of rows) seen.set(r.kanji, (seen.get(r.kanji) ?? 0) + 1);
const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
if (dupes.length > 0) fail(`Duplicate characters: ${dupes.join("")}`);

// Per-grade counts + total.
const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
for (const r of rows) {
  if (counts[r.teach_grade] === undefined) {
    fail(`Character ${r.kanji} has out-of-range teach_grade ${r.teach_grade}`);
    continue;
  }
  counts[r.teach_grade] += 1;
}
for (const g of [1, 2, 3, 4, 5, 6]) {
  if (counts[g] !== EXPECTED_COUNTS[g]) {
    fail(`Grade ${g} count is ${counts[g]}, expected ${EXPECTED_COUNTS[g]}`);
  }
}
if (rows.length !== EXPECTED_TOTAL) {
  fail(`Total is ${rows.length}, expected ${EXPECTED_TOTAL}`);
}

// Checksum over the frozen sorted unique character set.
const sorted = [...new Set(rows.map((r) => r.kanji))].sort();
const checksum = createHash("sha256").update(sorted.join(""), "utf8").digest("hex");
if (checksum !== manifest.checksum) {
  fail(
    `Checksum mismatch: computed ${checksum}, frozen ${manifest.checksum}. ` +
      `A character was substituted, added, or removed since the set was frozen.`,
  );
}

// ---------------------------------------------------------------------------
// §19.2 data delivery (0008): kanji_jouyou / kanji_reading_stage /
// lexical_reading_rule. Mirrors src/curriculum/ingest.ts's
// validateJouyou/validateReadingStage/validateLexicalRules/
// validateClassifierRegressionSet — see that file for the reasoning behind
// each check (esp. why kanji_reading_stage.kanji is checked against
// kanji_jouyou, not kanji_teach_grade).
// ---------------------------------------------------------------------------
const jouyou = JSON.parse(readFileSync(join(DATA_DIR, "kanji_jouyou.json"), "utf8"));
const readingStage = JSON.parse(readFileSync(join(DATA_DIR, "kanji_reading_stage.json"), "utf8"));
const lexicalRules = JSON.parse(readFileSync(join(DATA_DIR, "lexical_reading_rule.json"), "utf8"));

const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const SCHOOL_STAGES = new Set(["elementary", "junior_high", "high_school"]);
const LEXICAL_RULE_KINDS = new Set(["jukujikun", "rendaku", "proper_noun", "furoku"]);

// kanji_jouyou vs kanji_teach_grade consistency.
{
  const kyoikuSet = new Set(rows.map((r) => r.kanji));
  const seen = new Set();
  let inKyoikuCount = 0;
  for (const r of jouyou) {
    if (!r.kanji || [...r.kanji].length !== 1) fail(`kanji_jouyou: invalid kanji value ${JSON.stringify(r.kanji)}`);
    if (seen.has(r.kanji)) fail(`kanji_jouyou: duplicate kanji ${r.kanji}`);
    seen.add(r.kanji);
    const shouldBeKyoiku = kyoikuSet.has(r.kanji);
    if (r.in_kyoiku !== shouldBeKyoiku) {
      fail(`kanji_jouyou (${r.kanji}): in_kyoiku=${r.in_kyoiku} but kanji_teach_grade membership is ${shouldBeKyoiku}`);
    }
    if (r.in_kyoiku) inKyoikuCount++;
  }
  if (inKyoikuCount !== kyoikuSet.size) {
    fail(`kanji_jouyou: ${inKyoikuCount} rows flagged in_kyoiku, expected ${kyoikuSet.size}`);
  }
  if (jouyou.length !== 2136) fail(`kanji_jouyou: total is ${jouyou.length}, expected 2136 (常用漢字)`);
}

// kanji_reading_stage: structural + FK integrity against kanji_jouyou, plus
// the §6.3 equality rule (Codex PR #7 review, finding 2): elementary_grade
// must equal kanji_teach_grade.teach_grade for a kyōiku character and must be
// null for a non-kyōiku (jōyō-only) character — a range check alone would
// silently accept a row carrying the wrong character's grade.
{
  const jouyouSet = new Set(jouyou.map((r) => r.kanji));
  const teachGradeByKanji = new Map(rows.map((r) => [r.kanji, r.teach_grade]));
  const seen = new Set();
  for (const [i, r] of readingStage.entries()) {
    const where = `kanji_reading_stage[${i}] (${r.kanji}/${r.reading_kana})`;
    if (!r.kanji || [...r.kanji].length !== 1) fail(`${where}: invalid kanji value`);
    if (!jouyouSet.has(r.kanji)) fail(`${where}: kanji not present in kanji_jouyou (FK integrity, §6.2/0008)`);
    if (!r.reading_kana) fail(`${where}: empty reading_kana`);
    if (r.reading_type !== "on" && r.reading_type !== "kun") fail(`${where}: invalid reading_type ${JSON.stringify(r.reading_type)}`);
    if (!SCHOOL_STAGES.has(r.school_stage)) fail(`${where}: invalid school_stage ${JSON.stringify(r.school_stage)}`);
    if (r.elementary_grade !== null && (!Number.isInteger(r.elementary_grade) || r.elementary_grade < 1 || r.elementary_grade > 6)) {
      fail(`${where}: elementary_grade ${r.elementary_grade} out of range 1..6`);
    }
    if (teachGradeByKanji.has(r.kanji)) {
      const expected = teachGradeByKanji.get(r.kanji);
      if (r.elementary_grade !== expected) {
        fail(`${where}: elementary_grade is ${r.elementary_grade}, but kanji_teach_grade.teach_grade for ${r.kanji} is ${expected} (§6.3 equality rule)`);
      }
    } else if (r.elementary_grade !== null) {
      fail(`${where}: elementary_grade is ${r.elementary_grade}, but ${r.kanji} is not in kanji_teach_grade (jōyō-only characters must have a null elementary_grade, §6.3)`);
    }
    if (!Number.isInteger(r.source_page) || r.source_page < 1) fail(`${where}: source_page must be a positive integer, got ${r.source_page}`);
    if (!CONFIDENCE_VALUES.has(r.confidence)) fail(`${where}: invalid confidence ${JSON.stringify(r.confidence)}`);
    const dupeKey = `${r.kanji} ${r.reading_kana} ${r.reading_type} ${r.school_stage}`;
    if (seen.has(dupeKey)) fail(`${where}: duplicate (kanji, reading_kana, reading_type, school_stage)`);
    seen.add(dupeKey);
  }
  if (readingStage.length !== 4388) fail(`kanji_reading_stage: total is ${readingStage.length}, expected 4388`);
}

// lexical_reading_rule: structural checks + rule_kind/source_reading_type consistency.
{
  const seen = new Set();
  for (const [i, r] of lexicalRules.entries()) {
    const where = `lexical_reading_rule[${i}] (${r.surface}/${r.reading_kana})`;
    if (!r.surface) fail(`${where}: empty surface`);
    if (!r.reading_kana) fail(`${where}: empty reading_kana`);
    if (!LEXICAL_RULE_KINDS.has(r.rule_kind)) fail(`${where}: invalid rule_kind ${JSON.stringify(r.rule_kind)}`);
    if (!SCHOOL_STAGES.has(r.min_stage)) fail(`${where}: invalid min_stage ${JSON.stringify(r.min_stage)}`);
    if (!Number.isInteger(r.source_page) || r.source_page < 1) fail(`${where}: source_page must be a positive integer (NOT NULL), got ${r.source_page}`);
    if (!CONFIDENCE_VALUES.has(r.confidence)) fail(`${where}: invalid confidence ${JSON.stringify(r.confidence)}`);
    if (r.source_reading_type !== null && r.source_reading_type !== "special" && r.source_reading_type !== "proper_name") {
      fail(`${where}: invalid source_reading_type ${JSON.stringify(r.source_reading_type)}`);
    }
    if (r.rule_kind === "jukujikun" && r.source_reading_type !== null && r.source_reading_type !== "special") {
      fail(`${where}: rule_kind jukujikun but source_reading_type is ${r.source_reading_type}, expected special`);
    }
    if (r.rule_kind === "proper_noun" && r.source_reading_type !== null && r.source_reading_type !== "proper_name") {
      fail(`${where}: rule_kind proper_noun but source_reading_type is ${r.source_reading_type}, expected proper_name`);
    }
    const dupeKey = `${r.surface} ${r.reading_kana} ${r.rule_kind}`;
    if (seen.has(dupeKey)) fail(`${where}: duplicate (surface, reading_kana, rule_kind)`);
    seen.add(dupeKey);
  }
  if (lexicalRules.length !== 135) fail(`lexical_reading_rule: total is ${lexicalRules.length}, expected 135`);
}

// §15.5 classifier regression-set coverage — data layer only (the classifier
// itself is Sprint 3, out of scope here).
//
// 'pending_rendaku' (手紙 -> てがみ) is checked separately from
// 'lexical'/'reading_stage': character co-occurrence in kanji_reading_stage
// (手 exists, 紙 exists) does NOT establish that the voiced compound
// reading resolves — that was a false-green proxy (Codex PR #7 review,
// finding 1). No curated rendaku source has been delivered (§19.2 remains
// open), so this is EXPECTED to be unresolved right now; it is reported as
// a distinct "pending" line, never silently counted as PASS.
{
  const REGRESSION_SET = [
    { surface: "今日", expect: "lexical" },
    { surface: "明日", expect: "lexical" },
    { surface: "大人", expect: "lexical" },
    { surface: "一人", expect: "lexical" },
    { surface: "一日", expect: "lexical" },
    { surface: "二十日", expect: "lexical" },
    { surface: "今年", expect: "lexical" },
    { surface: "人気", expect: "reading_stage" },
    { surface: "河原", expect: "lexical" },
    { surface: "眼鏡", expect: "lexical" },
    { surface: "生", expect: "reading_stage" },
    { surface: "手紙", expect: "pending_rendaku", reading: "てがみ" },
    { surface: "紙", expect: "reading_stage" },
  ];
  const lexicalSurfaces = new Set(lexicalRules.map((r) => r.surface));
  const readingKanji = new Set(readingStage.map((r) => r.kanji));
  const pendingLines = [];
  for (const entry of REGRESSION_SET) {
    if (entry.expect === "lexical") {
      if (!lexicalSurfaces.has(entry.surface)) fail(`§15.5 regression set: "${entry.surface}" missing from lexical_reading_rule`);
    } else if (entry.expect === "reading_stage") {
      const missing = [...entry.surface].filter((c) => !readingKanji.has(c));
      if (missing.length > 0) fail(`§15.5 regression set: "${entry.surface}" has character(s) ${missing.join("")} missing from kanji_reading_stage`);
    } else if (entry.expect === "pending_rendaku") {
      const resolved = lexicalRules.some((r) => r.surface === entry.surface && r.reading_kana === entry.reading);
      if (!resolved) {
        pendingLines.push(
          `${entry.surface} -> ${entry.reading} (rendaku) — known gap, §19.2 remains open pending curated rendaku data delivery`,
        );
      }
    }
  }
  for (const line of pendingLines) {
    console.log(`● PENDING (§15.5 regression set / §19.2): ${line} — NOT covered, this is not a failure`);
  }
}

// ---------------------------------------------------------------------------
// Provenance-manifest assertion (v2.3 §6.5): the manifest must be present,
// well-formed, cover every grade block, and reference the committed PDF hash.
// The authoritative manifest is repo-root sources_provenance.json (the YAML
// mirror is regenerated from it; JSON is what is asserted here).
// ---------------------------------------------------------------------------
const MANIFEST_PATH = join(HERE, "..", "sources_provenance.json");
let provenance = null;
try {
  provenance = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
} catch (error) {
  fail(`provenance manifest missing or malformed at sources_provenance.json: ${error.message}`);
}

// Shared hash + verifier-identity checks, applied to each dataset's source
// record. `checkBlockCoverage` is only meaningful for kanji_teach_grade's
// block-level provenance (§6.1's asymmetry: block-level for the character
// table, per-row for the reading/lexical tables — see 0008/ingest.ts).
function checkProvenanceSource(provenance, datasetName, { checkBlockCoverage = false } = {}) {
  const source = (provenance.sources ?? []).find((s) => s.dataset === datasetName);
  if (!source) {
    fail(`provenance manifest has no source_record for dataset '${datasetName}' (§6.1)`);
    return;
  }
  const sha = source.file_hash?.value;
  if (!/^[0-9a-f]{64}$/.test(sha ?? "")) {
    fail(`provenance manifest (${datasetName}) does not reference a well-formed committed PDF SHA-256 (§6.1/§6.5)`);
  }
  if (source.file_hash?.status !== "CONFIRMED") {
    fail(
      `provenance manifest (${datasetName}) file_hash.status is '${source.file_hash?.status}', expected CONFIRMED — ` +
        `a PENDING/placeholder hash must not pass the gate (§6.1.1: hash verification is not waived)`,
    );
  }
  if (checkBlockCoverage) {
    // Block-level page coverage (§6.1): every grade block 1..6 must be mapped.
    const mappingText = JSON.stringify(source.page_mapping ?? []);
    for (const grade of [1, 2, 3, 4, 5, 6]) {
      if (!mappingText.includes(`${grade}年生`)) {
        fail(`provenance page_mapping (${datasetName}) does not cover the grade-${grade} block (§6.1 block-level granularity)`);
      }
    }
  }
  // §6.1.1 requires a NAMED human verifier and a verification date — not a
  // truthy placeholder (issue #6 item 5: "x" must not pass).
  const verifiedAt = source.content_verification?.verified_at ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) {
    fail(
      `provenance manifest (${datasetName}) verified_at ${JSON.stringify(verifiedAt)} is not an ISO date (YYYY-MM-DD) — §6.1.1 requires a verification date`,
    );
  }
  const verifiedBy = (source.content_verification?.verified_by ?? "").trim();
  const PENDING_SENTINEL = "PENDING_COORDINATOR_IDENTIFICATION";
  if (verifiedBy === PENDING_SENTINEL) {
    // Explicit recorded gap (issue #6 item 5): the coordinator must supply
    // the actual verifier identity. Loud, but not a build failure — the
    // sentinel is exact-matched and cannot be hit by accident, unlike a
    // truthy placeholder.
    console.log(
      `● OPEN ITEM (§6.1.1 / issue #6 item 5): verified_by (${datasetName}) is PENDING_COORDINATOR_IDENTIFICATION — ` +
        "coordinator must record the actual human verifier's identity; do not leave this in place at launch",
    );
  } else if (
    verifiedBy.length < 3 ||
    /^(x+|tbd|todo|pending|none|n\/a|-|\?)$/i.test(verifiedBy) ||
    /_/.test(verifiedBy)
  ) {
    // Too short, a known placeholder, or a process-descriptor-style string
    // (underscored) — none of these is a person's name.
    fail(
      `provenance manifest (${datasetName}) verified_by ${JSON.stringify(verifiedBy)} does not look like a named human verifier (§6.1.1; issue #6 item 5). ` +
        `Record the individual's name, or the exact sentinel PENDING_COORDINATOR_IDENTIFICATION while it is being obtained.`,
    );
  }
}

if (provenance) {
  checkProvenanceSource(provenance, "kanji_teach_grade", { checkBlockCoverage: true });
  // §19.2: kanji_reading_stage and lexical_reading_rule share one source
  // record (both tables are extracted from the same 音訓割り振り表 PDF).
  checkProvenanceSource(provenance, "kanji_reading_stage / lexical_reading_rule (音訓割り振り表)");
}

if (process.exitCode === 1) {
  console.error("\n§6.5 curriculum coverage gate: FAILED");
  process.exit(1);
}

console.log(
  `✓ §6.5 curriculum coverage gate: PASS — ${rows.length} characters, ` +
    `grades ${[1, 2, 3, 4, 5, 6].map((g) => counts[g]).join("/")}, checksum ok, ` +
    `provenance manifest asserted (hash CONFIRMED, grade blocks 1-6 mapped, verifier field validated — see any OPEN ITEM line above for pending identity)`,
);
