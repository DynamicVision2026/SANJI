import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASSIFIER_REGRESSION_SET,
  computeChecksum,
  loadChecksumManifest,
  loadJouyou,
  loadLexicalRules,
  loadReadingStage,
  loadTeachGrade,
  validateClassifierRegressionSet,
  validateJouyou,
  validateLexicalRules,
  validateReadingStage,
  validateTeachGrade,
} from "./ingest";
import { EXPECTED_GRADE_COUNTS, EXPECTED_TOTAL, type LexicalReadingRule } from "./schema";

const rows = loadTeachGrade();
const manifest = loadChecksumManifest();

test("kanji_teach_grade passes all §6.5 assertions", () => {
  const result = validateTeachGrade(rows, manifest);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("per-grade counts are exactly 80/160/200/202/193/191 (§6.5)", () => {
  const counts: Record<number, number> = {};
  for (const r of rows) counts[r.teach_grade] = (counts[r.teach_grade] ?? 0) + 1;
  assert.deepEqual(counts, EXPECTED_GRADE_COUNTS);
});

test("total is 1,026 unique characters (§6.5)", () => {
  assert.equal(rows.length, EXPECTED_TOTAL);
  assert.equal(new Set(rows.map((r) => r.kanji)).size, EXPECTED_TOTAL);
});

test("checksum matches the frozen manifest (§6.5 substitution guard)", () => {
  assert.equal(computeChecksum(rows), manifest.checksum);
});

test("2020-revision spot checks: 都道府県 kanji are Grade 4", () => {
  // The 20 prefecture kanji added in the 2017 revision are all Grade 4.
  const byKanji = new Map(rows.map((r) => [r.kanji, r]));
  for (const k of ["茨", "媛", "岡", "潟", "岐", "熊", "香", "佐", "埼", "崎", "滋", "鹿", "縄", "井", "沖", "栃", "奈", "梨", "阪", "阜"]) {
    assert.equal(byKanji.get(k)?.teach_grade, 4, `${k} should be Grade 4 in the 2020 revision`);
  }
  // Re-graded into Grade 4 from grade 5/6 in the revision.
  for (const k of ["賀", "群", "徳", "富", "城"]) {
    assert.equal(byKanji.get(k)?.teach_grade, 4, `${k} moved to Grade 4 in the 2020 revision`);
  }
});

test("duplicate detection fails a substituted set", () => {
  const bad = rows.map((r) => ({ ...r }));
  // Substitute a Grade 6 char for another — count preserved, checksum breaks.
  bad[bad.length - 1] = { ...bad[bad.length - 1]!, kanji: bad[0]!.kanji };
  const result = validateTeachGrade(bad, manifest);
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// §19.2 data delivery: reading-stage (kanji_reading_stage), lexical exception
// (lexical_reading_rule), and the kanji_jouyou master added in 0008.
// ---------------------------------------------------------------------------

const jouyou = loadJouyou();
const readingStage = loadReadingStage();
const lexicalRules = loadLexicalRules();

test("kanji_jouyou is internally consistent with kanji_teach_grade (0008)", () => {
  const result = validateJouyou(jouyou, rows);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(jouyou.length, 2136, "full 常用 set is 2,136 characters");
});

test("kanji_reading_stage passes structural + FK-integrity checks (§19.2)", () => {
  const result = validateReadingStage(readingStage, jouyou, rows);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(readingStage.length, 4388);
});

test("§6.3 equality rule is enforced, not just range-checked (Codex PR #7 finding 2)", () => {
  // A row claiming a kyōiku character's elementary_grade that DIVERGES from
  // kanji_teach_grade.teach_grade must fail — a plain 1..6 range check would
  // let this through silently.
  const miya = readingStage.find((r) => r.kanji === "宮" && r.reading_kana === "みや");
  assert.ok(miya, "宮/みや fixture row must exist");
  const wrongGrade = readingStage.map((r) => (r === miya ? { ...r, elementary_grade: 5 } : r));
  const badGrade = validateReadingStage(wrongGrade, jouyou, rows);
  assert.equal(badGrade.ok, false);
  assert.ok(badGrade.errors.some((e) => e.includes("equality rule")));

  // A jōyō-only (non-kyōiku) character carrying a non-null elementary_grade
  // must also fail.
  const nonKyoiku = jouyou.find((r) => !r.in_kyoiku);
  assert.ok(nonKyoiku);
  const spuriousRow = readingStage.find((r) => r.kanji === nonKyoiku.kanji);
  assert.ok(spuriousRow);
  const withSpuriousGrade = readingStage.map((r) =>
    r === spuriousRow ? { ...r, elementary_grade: 3 } : r,
  );
  const badNonKyoiku = validateReadingStage(withSpuriousGrade, jouyou, rows);
  assert.equal(badNonKyoiku.ok, false);
  assert.ok(badNonKyoiku.errors.some((e) => e.includes("not in kanji_teach_grade")));
});

test("lexical_reading_rule passes structural checks (§19.2)", () => {
  const result = validateLexicalRules(lexicalRules);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(lexicalRules.length, 135);
});

test("§15.5 classifier regression set: non-rendaku members are fully resolvable from ingested data", () => {
  const result = validateClassifierRegressionSet(readingStage, lexicalRules);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.total, CLASSIFIER_REGRESSION_SET.length);
});

test("§15.5 regression set: 手紙 rendaku is honestly reported as PENDING, not falsely covered (Codex PR #7 finding 1)", () => {
  // Checking that 手 and 紙 each individually exist in kanji_reading_stage
  // (the old check) is a false-green proxy: it does not establish that the
  // voiced compound reading 手紙 -> てがみ resolves. No curated rendaku
  // source has been delivered (§19.2 remains open), so this MUST show up as
  // pending, not as covered/passing.
  const result = validateClassifierRegressionSet(readingStage, lexicalRules);
  assert.equal(result.ok, true, "the gap is recorded as pending, not a hard failure");
  assert.equal(
    result.pending.some((p) => p.includes("手紙") && p.includes("てがみ")),
    true,
    "手紙 -> てがみ rendaku gap must be visibly reported as pending",
  );
});

test("§15.5 regression set: pending_rendaku flips to covered (not pending) once a real rule is delivered", () => {
  // Forward-compatibility check: if a future ingestion adds the curated
  // rendaku rule, this function must start reporting it as resolved without
  // any code change here.
  const withRendakuDelivered: LexicalReadingRule[] = [
    ...lexicalRules,
    {
      id: -1,
      surface: "手紙",
      reading_kana: "てがみ",
      rule_kind: "rendaku",
      min_stage: "elementary",
      min_elementary_grade: null,
      source_page: 1,
      confidence: "high",
      extraction_notes: null,
      source_reading_type: null,
    },
  ];
  const result = validateClassifierRegressionSet(readingStage, withRendakuDelivered);
  assert.equal(result.pending.some((p) => p.includes("手紙")), false);
});

test("§6.3 central example: 宮 character grade is NOT a proxy for reading grade", () => {
  // 宮 is a Grade 3 kyōiku character, but its グウ reading is junior_high —
  // spec's own worked example for "character grade is not a proxy for
  // reading grade" (§6.3). Both the elementary kun reading and the
  // junior_high on reading must carry elementary_grade=3 (character-level),
  // while only the elementary row's school_stage is 'elementary'.
  const miyaRows = readingStage.filter((r) => r.kanji === "宮");
  const kun = miyaRows.find((r) => r.reading_kana === "みや");
  const guu = miyaRows.find((r) => r.reading_kana === "グウ");
  assert.ok(kun && guu, "both 宮 readings must be present");
  assert.equal(kun.school_stage, "elementary");
  assert.equal(guu.school_stage, "junior_high");
  assert.equal(kun.elementary_grade, 3, "character grade recorded even on the elementary reading");
  assert.equal(guu.elementary_grade, 3, "character grade recorded even on the junior_high reading (§6.3)");
});

test("jōyō-only (non-kyōiku) characters carry a null elementary_grade", () => {
  const nonKyoiku = jouyou.find((r) => !r.in_kyoiku);
  assert.ok(nonKyoiku, "at least one jōyō-only character must exist");
  const rowsForIt = readingStage.filter((r) => r.kanji === nonKyoiku.kanji);
  assert.ok(rowsForIt.length > 0);
  for (const r of rowsForIt) assert.equal(r.elementary_grade, null);
});

test("low/medium-confidence rows stay flagged, not silently promoted (issue: 叱)", () => {
  const shitsuRows = readingStage.filter((r) => r.kanji === "叱");
  assert.ok(shitsuRows.length > 0, "叱 must be ingested despite the glyph-recovery note");
  for (const r of shitsuRows) {
    assert.equal(r.confidence, "medium");
    assert.ok(r.extraction_notes && r.extraction_notes.length > 0);
  }
});

test("rule_kind <-> source_reading_type consistency is enforced", () => {
  const bad = lexicalRules.map((r) => ({ ...r }));
  bad[0] = { ...bad[0]!, source_reading_type: "proper_name" as const, rule_kind: "jukujikun" as const };
  const result = validateLexicalRules(bad);
  assert.equal(result.ok, false);
});
