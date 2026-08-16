/**
 * Curriculum ingestion + validation (spec §6).
 *
 * Loads the frozen `kanji_teach_grade` dataset and exposes the §6.5 coverage
 * checks as a reusable, deterministic function. The CI script
 * scripts/check-curriculum.mjs and the ingest test both call `validateTeachGrade`
 * — there is one implementation of the assertions, not two.
 *
 * Reading-stage and lexical-exception ingestion (§6.1 rows 2–3) are BLOCKED on
 * founder-owned source extraction (§19.2). The schema and CI hooks are
 * scaffolded so that ingestion can drop in without a migration (see
 * `readingStageStatus`); we do NOT fabricate reading data.
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
  type KanjiTeachGrade,
} from "./schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, "data", "kanji_teach_grade.json");
const CHECKSUM_PATH = join(HERE, "data", "kanji_teach_grade.checksum.json");

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

/**
 * Ingestion status of the reading-stage and lexical-exception levels (§6.1
 * rows 2–3 / §19.2). These are founder-owned extractions not yet delivered. The
 * schema and CI hooks exist; the data does not, and we do NOT fabricate it.
 * Week 2 ingestion (§18) drops in without a migration.
 */
export const readingStageStatus = {
  kanji_reading_stage: "pending_founder_source" as const,
  lexical_reading_rule: "pending_founder_source" as const,
  blockingItem: "§19.2",
};
