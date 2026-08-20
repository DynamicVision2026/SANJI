import lexicalRules from "../curriculum/data/lexical_reading_rule.json";
import readingStage from "../curriculum/data/kanji_reading_stage.json";
import variantSnapshot from "../curriculum/data/reading_variants.json";
import type { KanjiReadingStage, ReadingVariantSnapshot } from "../curriculum/schema";

export type H7Result =
  | { classification: "CORRECT"; rule_kind: "jukujikun"; source_page: number }
  | { classification: "CORRECT"; rule_kind: "jukujikun"; source_page: null; reading_variant_id: string }
  | { classification: "H7"; expected_readings: string[]; source_page: number }
  | { classification: "UNCLASSIFIED" };

function normalizeReading(reading: string): string {
  return [...reading.normalize("NFC")]
    .map((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
    })
    .join("");
}

function isCompositionalReading(surface: string, reading: string): boolean {
  let prefixes = [""];
  for (const kanji of surface) {
    const componentReadings = [...new Set(
      (readingStage as KanjiReadingStage[])
        .filter((row) => row.kanji === kanji)
        .map((row) => normalizeReading(row.reading_kana)),
    )];
    if (componentReadings.length === 0) return false;
    prefixes = prefixes
      .flatMap((prefix) => componentReadings.map((component) => prefix + component))
      .filter((prefix) => reading.startsWith(prefix));
    if (prefixes.length === 0) return false;
  }
  return prefixes.includes(reading);
}

/** Whole-surface lexical lookup, then a closed-set compositional H7 check. */
export function classifyH7(surface: string, studentReading: string): H7Result {
  if (typeof surface !== "string" || typeof studentReading !== "string" || !surface || !studentReading) {
    return { classification: "UNCLASSIFIED" };
  }
  const matches = lexicalRules.filter((rule) => rule.rule_kind === "jukujikun" && rule.surface === surface);
  if (matches.length === 0) return { classification: "UNCLASSIFIED" };
  const normalizedReading = normalizeReading(studentReading);
  const variants = (variantSnapshot as unknown as ReadingVariantSnapshot).variants.filter(
    (variant) => variant.verification_status === "frozen" && variant.surface === surface,
  );
  const validReadings = [...new Set([
    ...matches.map((rule) => rule.reading_kana),
    ...variants.map((variant) => variant.reading_kana),
  ])].sort();
  if (matches.some((rule) => normalizeReading(rule.reading_kana) === normalizedReading)) {
    return { classification: "CORRECT", rule_kind: "jukujikun", source_page: matches[0]!.source_page };
  }
  const matchedVariant = variants.find((variant) => normalizeReading(variant.reading_kana) === normalizedReading);
  if (matchedVariant) {
    return {
      classification: "CORRECT",
      rule_kind: "jukujikun",
      source_page: null,
      reading_variant_id: matchedVariant.variant_id,
    };
  }
  return isCompositionalReading(surface, normalizedReading)
    ? { classification: "H7", expected_readings: validReadings, source_page: matches[0]!.source_page }
    : { classification: "UNCLASSIFIED" };
}
