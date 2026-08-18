import readingStage from "../curriculum/data/kanji_reading_stage.json";
import type { KanjiReadingStage } from "../curriculum/schema";

export type H2Result =
  | { classification: "CORRECT"; reading_type: "on" | "kun"; source_page: number }
  | { classification: "H2"; expected_reading: string; observed_reading: string; source_page: number }
  | { classification: "UNCLASSIFIED" };

const stageRank = { elementary: 0, junior_high: 1, high_school: 2 } as const;

function normalizeReading(reading: string): string {
  return [...reading.normalize("NFC")]
    .map((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
    })
    .join("");
}

/** Classify only a source-backed on/kun substitution for the same kanji. */
export function classifyOnKun(
  kanji: string,
  targetReading: string,
  studentReading: string,
  maxStage: keyof typeof stageRank = "high_school",
): H2Result {
  const rows = (readingStage as KanjiReadingStage[]).filter(
    (row) => row.kanji === kanji && stageRank[row.school_stage] <= stageRank[maxStage],
  );
  const target = rows.find((row) => normalizeReading(row.reading_kana) === normalizeReading(targetReading));
  if (!target) return { classification: "UNCLASSIFIED" };
  if (normalizeReading(studentReading) === normalizeReading(targetReading)) {
    return { classification: "CORRECT", reading_type: target.reading_type, source_page: target.source_page };
  }
  const observed = rows.find((row) => normalizeReading(row.reading_kana) === normalizeReading(studentReading));
  if (!observed || observed.reading_type === target.reading_type) return { classification: "UNCLASSIFIED" };
  return {
    classification: "H2",
    expected_reading: target.reading_kana,
    observed_reading: observed.reading_kana,
    source_page: target.source_page,
  };
}
