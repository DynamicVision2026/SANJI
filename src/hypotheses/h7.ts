import lexicalRules from "../curriculum/data/lexical_reading_rule.json";

export type H7Result =
  | { classification: "CORRECT"; rule_kind: "jukujikun"; source_page: number }
  | { classification: "H7"; expected_readings: string[]; source_page: number }
  | { classification: "UNCLASSIFIED" };

/** Whole-surface lexical lookup. Call this before any character-level fallback. */
export function classifyH7(surface: string, studentReading: string): H7Result {
  if (typeof surface !== "string" || typeof studentReading !== "string" || !surface || !studentReading) {
    return { classification: "UNCLASSIFIED" };
  }
  const matches = lexicalRules.filter((rule) => rule.rule_kind === "jukujikun" && rule.surface === surface);
  if (matches.length === 0) return { classification: "UNCLASSIFIED" };
  const normalizedReading = studentReading.normalize("NFC");
  if (matches.some((rule) => rule.reading_kana.normalize("NFC") === normalizedReading)) {
    return { classification: "CORRECT", rule_kind: "jukujikun", source_page: matches[0]!.source_page };
  }
  return {
    classification: "H7",
    expected_readings: [...new Set(matches.map((rule) => rule.reading_kana))].sort(),
    source_page: matches[0]!.source_page,
  };
}
