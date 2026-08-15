import test from "node:test";
import assert from "node:assert/strict";

import {
  computeChecksum,
  loadChecksumManifest,
  loadTeachGrade,
  validateTeachGrade,
} from "./ingest";
import { EXPECTED_GRADE_COUNTS, EXPECTED_TOTAL } from "./schema";

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
