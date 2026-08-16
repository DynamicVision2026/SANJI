/**
 * Curriculum ingestion + validation (spec §6).
 *
 * Loads the frozen `kanji_teach_grade` dataset and exposes the §6.5 coverage
 * checks as a reusable, deterministic function. The CI script
 * scripts/check-curriculum.mjs and the ingest test both call `validateTeachGrade`
 * — there is one implementation of the assertions, not two.
 *
 * Reading-stage and lexical-exception ingestion (§6.1 rows 2–3, §19.2) landed
 * from the founder-delivered MEXT 音訓割り振り表 extraction. `kanji_jouyou`
 * (0008) is a new level: the real data covers all 2,136 常用 characters, not
 * just the 1,026 kyōiku characters in kanji_teach_grade — see the migration
 * comment for why the original kanji_teach_grade FK was wrong.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  EXPECTED_GRADE_COUNTS,
  EXPECTED_TOTAL,
  GRADE_MAX,
  GRADE_MIN,
  kankenLevelForGrade,
  type KanjiJouyou,
  type KanjiReadingStage,
  type KanjiTeachGrade,
  type LexicalReadingRule,
} from "./schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, "data", "kanji_teach_grade.json");
const CHECKSUM_PATH = join(HERE, "data", "kanji_teach_grade.checksum.json");
const JOUYOU_PATH = join(HERE, "data", "kanji_jouyou.json");
const READING_STAGE_PATH = join(HERE, "data", "kanji_reading_stage.json");
const LEXICAL_RULE_PATH = join(HERE, "data", "lexical_reading_rule.json");

export interface ChecksumManifest {
  algorithm: string;
  encoding: string;
  basis: string;
  checksum: string;
  total: number;
  per_grade_counts: Record<string, number>;
}

export function loadTeachGrade(path: string = DATA_PATH): KanjiTeachGrade[] {
  return JSON.parse(readFileSync(path, "utf8")) as KanjiTeachGrade[];
}

export function loadChecksumManifest(path: string = CHECKSUM_PATH): ChecksumManifest {
  return JSON.parse(readFileSync(path, "utf8")) as ChecksumManifest;
}

/**
 * Checksum over the frozen sorted unique character set (§6.5). Counts alone do
 * not detect substitution — swapping one Grade 6 character for another
 * preserves the count. The checksum is over the sorted, de-duplicated
 * characters concatenated with no separators.
 */
export function computeChecksum(rows: readonly KanjiTeachGrade[]): string {
  const sorted = [...new Set(rows.map((r) => r.kanji))].sort();
  return createHash("sha256").update(sorted.join(""), "utf8").digest("hex");
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  total: number;
  perGradeCounts: Record<number, number>;
  checksum: string;
}

/**
 * The §6.5 CI coverage checks, as a pure function:
 *   - per-grade count assertions (80/160/200/202/193/191, total 1,026)
 *   - duplicate detection
 *   - checksum assertion over the frozen sorted character set
 * Plus structural integrity of each row (grade range, 漢検 mapping, metadata).
 *
 * Returns all failures rather than throwing on the first, so CI reports the
 * full picture. `ok === false` means the build must fail (fail loud, §9).
 */
export function validateTeachGrade(
  rows: readonly KanjiTeachGrade[],
  manifest: ChecksumManifest,
): ValidationResult {
  const errors: string[] = [];

  // Duplicate detection.
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.kanji, (seen.get(r.kanji) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupes.length > 0) {
    errors.push(`Duplicate characters detected: ${dupes.join("")}`);
  }

  // Per-grade counts.
  const perGradeCounts: Record<number, number> = {};
  for (let g = GRADE_MIN; g <= GRADE_MAX; g++) perGradeCounts[g] = 0;
  for (const r of rows) {
    if (r.teach_grade < GRADE_MIN || r.teach_grade > GRADE_MAX) {
      errors.push(`Character ${r.kanji} has out-of-range teach_grade ${r.teach_grade}`);
      continue;
    }
    perGradeCounts[r.teach_grade] = (perGradeCounts[r.teach_grade] ?? 0) + 1;
  }
  for (let g = GRADE_MIN; g <= GRADE_MAX; g++) {
    const expected = EXPECTED_GRADE_COUNTS[g];
    if (perGradeCounts[g] !== expected) {
      errors.push(
        `Grade ${g} count is ${perGradeCounts[g]}, expected ${expected} (§6.5)`,
      );
    }
  }

  // Total.
  if (rows.length !== EXPECTED_TOTAL) {
    errors.push(`Total is ${rows.length}, expected ${EXPECTED_TOTAL} (§6.5)`);
  }

  // Per-row structural integrity.
  for (const r of rows) {
    if (!r.kanji || [...r.kanji].length !== 1) {
      errors.push(`Invalid kanji value: ${JSON.stringify(r.kanji)}`);
    }
    if (r.kanken_level !== kankenLevelForGrade(r.teach_grade)) {
      errors.push(
        `Character ${r.kanji}: kanken_level ${r.kanken_level} does not match grade ${r.teach_grade} (expected ${kankenLevelForGrade(r.teach_grade)}, §6.6)`,
      );
    }
    if (!Number.isInteger(r.stroke_count) || r.stroke_count <= 0) {
      errors.push(`Character ${r.kanji}: invalid stroke_count ${r.stroke_count}`);
    }
    if (!r.radical) {
      errors.push(`Character ${r.kanji}: missing radical`);
    }
  }

  // Checksum against the frozen manifest.
  const checksum = computeChecksum(rows);
  if (checksum !== manifest.checksum) {
    errors.push(
      `Checksum mismatch: computed ${checksum}, frozen ${manifest.checksum} (§6.5). ` +
        `A character was substituted, added, or removed since the set was frozen.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    total: rows.length,
    perGradeCounts,
    checksum,
  };
}

export function loadJouyou(path: string = JOUYOU_PATH): KanjiJouyou[] {
  return JSON.parse(readFileSync(path, "utf8")) as KanjiJouyou[];
}

/**
 * Consistency check between `kanji_jouyou` (0008) and the frozen
 * `kanji_teach_grade` it is a superset of: every kyōiku character must be
 * present and flagged `in_kyoiku`, and `in_kyoiku` must never be true for a
 * character kanji_teach_grade doesn't contain — otherwise the FK repoint in
 * 0008 would silently accept reading-stage rows for a wrong/invented kyōiku
 * membership.
 */
export function validateJouyou(
  jouyouRows: readonly KanjiJouyou[],
  teachGradeRows: readonly KanjiTeachGrade[],
): DatasetValidationResult {
  const errors: string[] = [];
  const kyoikuSet = new Set(teachGradeRows.map((r) => r.kanji));
  const seen = new Set<string>();
  let inKyoikuCount = 0;

  for (const [i, r] of jouyouRows.entries()) {
    if (!r.kanji || [...r.kanji].length !== 1) errors.push(`kanji_jouyou[${i}]: invalid kanji value`);
    if (seen.has(r.kanji)) errors.push(`kanji_jouyou[${i}]: duplicate kanji ${r.kanji}`);
    seen.add(r.kanji);
    const shouldBeKyoiku = kyoikuSet.has(r.kanji);
    if (r.in_kyoiku !== shouldBeKyoiku) {
      errors.push(
        `kanji_jouyou[${i}] (${r.kanji}): in_kyoiku=${r.in_kyoiku} but kanji_teach_grade membership is ${shouldBeKyoiku}`,
      );
    }
    if (r.in_kyoiku) inKyoikuCount++;
  }
  if (inKyoikuCount !== kyoikuSet.size) {
    errors.push(`kanji_jouyou: ${inKyoikuCount} rows flagged in_kyoiku, expected ${kyoikuSet.size} (every kanji_teach_grade character)`);
  }

  return { ok: errors.length === 0, errors, total: jouyouRows.length };
}

export function loadReadingStage(path: string = READING_STAGE_PATH): KanjiReadingStage[] {
  return JSON.parse(readFileSync(path, "utf8")) as KanjiReadingStage[];
}

export function loadLexicalRules(path: string = LEXICAL_RULE_PATH): LexicalReadingRule[] {
  return JSON.parse(readFileSync(path, "utf8")) as LexicalReadingRule[];
}

const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const SCHOOL_STAGES = new Set(["elementary", "junior_high", "high_school"]);

export interface DatasetValidationResult {
  ok: boolean;
  errors: string[];
  total: number;
}

/**
 * §6.5-style structural + FK-integrity checks for `kanji_reading_stage`
 * (§19.2 ingestion, 0008 schema). `jouyouRows` is the full 2,136-character
 * jōyō set kanji_reading_stage.kanji must be drawn from (NOT
 * kanji_teach_grade — see the 0008 migration comment for why).
 */
export function validateReadingStage(
  rows: readonly KanjiReadingStage[],
  jouyouRows: readonly KanjiJouyou[],
): DatasetValidationResult {
  const errors: string[] = [];
  const jouyouSet = new Set(jouyouRows.map((r) => r.kanji));
  const kyoikuGrade = new Map<string, number | undefined>();
  for (const r of jouyouRows) if (r.in_kyoiku) kyoikuGrade.set(r.kanji, undefined);

  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const where = `kanji_reading_stage[${i}] (${r.kanji}/${r.reading_kana})`;
    if (!r.kanji || [...r.kanji].length !== 1) errors.push(`${where}: invalid kanji value`);
    if (!jouyouSet.has(r.kanji)) {
      errors.push(`${where}: kanji not present in kanji_jouyou (FK integrity, §6.2/0008)`);
    }
    if (!r.reading_kana) errors.push(`${where}: empty reading_kana`);
    if (r.reading_type !== "on" && r.reading_type !== "kun") {
      errors.push(`${where}: invalid reading_type ${JSON.stringify(r.reading_type)}`);
    }
    if (!SCHOOL_STAGES.has(r.school_stage)) {
      errors.push(`${where}: invalid school_stage ${JSON.stringify(r.school_stage)}`);
    }
    if (
      r.elementary_grade !== null &&
      (!Number.isInteger(r.elementary_grade) || r.elementary_grade < GRADE_MIN || r.elementary_grade > GRADE_MAX)
    ) {
      errors.push(`${where}: elementary_grade ${r.elementary_grade} out of range 1..6`);
    }
    if (!Number.isInteger(r.source_page) || r.source_page < 1) {
      errors.push(`${where}: source_page must be a positive integer (§6.1 per-row provenance), got ${r.source_page}`);
    }
    if (!CONFIDENCE_VALUES.has(r.confidence)) {
      errors.push(`${where}: invalid confidence ${JSON.stringify(r.confidence)}`);
    }
    const dupeKey = `${r.kanji} ${r.reading_kana} ${r.reading_type} ${r.school_stage}`;
    if (seen.has(dupeKey)) errors.push(`${where}: duplicate (kanji, reading_kana, reading_type, school_stage)`);
    seen.add(dupeKey);
  }

  return { ok: errors.length === 0, errors, total: rows.length };
}

const LEXICAL_RULE_KINDS = new Set(["jukujikun", "rendaku", "proper_noun", "furoku"]);

/** §6.5-style structural checks for `lexical_reading_rule` (§19.2 ingestion, 0008 schema). */
export function validateLexicalRules(rows: readonly LexicalReadingRule[]): DatasetValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const where = `lexical_reading_rule[${i}] (${r.surface}/${r.reading_kana})`;
    if (!r.surface) errors.push(`${where}: empty surface`);
    if (!r.reading_kana) errors.push(`${where}: empty reading_kana`);
    if (!LEXICAL_RULE_KINDS.has(r.rule_kind)) {
      errors.push(`${where}: invalid rule_kind ${JSON.stringify(r.rule_kind)}`);
    }
    if (!SCHOOL_STAGES.has(r.min_stage)) {
      errors.push(`${where}: invalid min_stage ${JSON.stringify(r.min_stage)}`);
    }
    if (!Number.isInteger(r.source_page) || r.source_page < 1) {
      errors.push(`${where}: source_page must be a positive integer (§6.1 per-row provenance, source_page NOT NULL), got ${r.source_page}`);
    }
    if (!CONFIDENCE_VALUES.has(r.confidence)) {
      errors.push(`${where}: invalid confidence ${JSON.stringify(r.confidence)}`);
    }
    if (
      r.source_reading_type !== null &&
      r.source_reading_type !== "special" &&
      r.source_reading_type !== "proper_name"
    ) {
      errors.push(`${where}: invalid source_reading_type ${JSON.stringify(r.source_reading_type)}`);
    }
    // rule_kind <-> source_reading_type consistency, per the source's own
    // normalisation notes (jukujikun rows come from appendix_1/special;
    // proper_noun rows from appendix_2/proper_name).
    if (r.rule_kind === "jukujikun" && r.source_reading_type !== null && r.source_reading_type !== "special") {
      errors.push(`${where}: rule_kind jukujikun but source_reading_type is ${r.source_reading_type}, expected special`);
    }
    if (r.rule_kind === "proper_noun" && r.source_reading_type !== null && r.source_reading_type !== "proper_name") {
      errors.push(`${where}: rule_kind proper_noun but source_reading_type is ${r.source_reading_type}, expected proper_name`);
    }
    const dupeKey = `${r.surface} ${r.reading_kana} ${r.rule_kind}`;
    if (seen.has(dupeKey)) errors.push(`${where}: duplicate (surface, reading_kana, rule_kind)`);
    seen.add(dupeKey);
  }
  return { ok: errors.length === 0, errors, total: rows.length };
}

/**
 * §15.5 Classifier Determinism Gate's minimum regression-set coverage,
 * checked at the DATA layer (not the classifier itself — Sprint 3, out of
 * scope here): every member must be resolvable from the ingested tables, or
 * ingestion has silently lost a case the classifier work will need.
 *
 * Each entry's `expect` says where the member must be found: 'lexical' means
 * it must appear as a lexical_reading_rule.surface (whole-word exception);
 * 'reading_stage' means its characters' readings must be individually
 * resolvable from kanji_reading_stage (a plain compositional on/kun
 * reading — not every regression-set word is a lexical exception).
 */
export const CLASSIFIER_REGRESSION_SET: ReadonlyArray<{ surface: string; expect: "lexical" | "reading_stage" }> = [
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
  { surface: "手紙", expect: "reading_stage" },
  { surface: "紙", expect: "reading_stage" },
];

/**
 * Verify §15.5's regression set is resolvable from the ingested data (§19.2).
 * The 手紙/紙 rendaku pair has no lexical_reading_rule entry by design — this
 * source (MEXT 音訓割り振り表 + 付表) supplies jukujikun and proper-noun
 * exceptions only; curated rendaku rules are a separate, not-yet-delivered
 * source per §6.1's "curated 熟字訓 / 連濁 / proper-noun rules" line — so 紙's
 * かみ kun-reading being present in kanji_reading_stage is the correct and
 * complete data-layer expectation for that pair.
 */
export function validateClassifierRegressionSet(
  readingStage: readonly KanjiReadingStage[],
  lexicalRules: readonly LexicalReadingRule[],
): DatasetValidationResult {
  const errors: string[] = [];
  const lexicalSurfaces = new Set(lexicalRules.map((r) => r.surface));
  const readingKanji = new Set(readingStage.map((r) => r.kanji));

  for (const { surface, expect } of CLASSIFIER_REGRESSION_SET) {
    if (expect === "lexical") {
      if (!lexicalSurfaces.has(surface)) {
        errors.push(`§15.5 regression set: "${surface}" missing from lexical_reading_rule`);
      }
    } else {
      const missingChars = [...surface].filter((c) => !readingKanji.has(c));
      if (missingChars.length > 0) {
        errors.push(
          `§15.5 regression set: "${surface}" has character(s) ${missingChars.join("")} missing from kanji_reading_stage`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, total: CLASSIFIER_REGRESSION_SET.length };
}
