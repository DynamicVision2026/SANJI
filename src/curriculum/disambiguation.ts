import hakaruData from "./data/hakaru_disambiguation.json";

export type DisambiguationCertainty = "CONFIDENT" | "REVIEW_REQUIRED";

export interface DisambiguationResult {
  reading_kana: "はかる";
  target_kanji: "図" | "計" | "測" | "量" | null;
  certainty: DisambiguationCertainty;
  source_rule_id: string | null;
  matched_context: string | null;
}

interface HakaruRule {
  id: string;
  reading_kana: "はかる";
  target_kanji: "図" | "計" | "測" | "量";
  context_terms: string[];
  source_page: number;
  source_printed_page: number;
}

const rules = hakaruData.rules as HakaruRule[];

/**
 * Deterministic はかる PoC lookup. Longest matching source term wins; an
 * absent match or a tie across kanji is review-required, never guessed.
 */
export function disambiguateHakaru(context: string): DisambiguationResult {
  const matches = rules.flatMap((rule) =>
    rule.context_terms
      .filter((term) => context.includes(term))
      .map((term) => ({ rule, term })),
  );
  const longest = Math.max(0, ...matches.map(({ term }) => term.length));
  const finalists = matches.filter(({ term }) => term.length === longest);
  const targets = new Set(finalists.map(({ rule }) => rule.target_kanji));

  if (targets.size !== 1) {
    return {
      reading_kana: "はかる",
      target_kanji: null,
      certainty: "REVIEW_REQUIRED",
      source_rule_id: null,
      matched_context: null,
    };
  }

  const match = finalists[0]!;
  return {
    reading_kana: "はかる",
    target_kanji: match.rule.target_kanji,
    certainty: "CONFIDENT",
    source_rule_id: match.rule.id,
    matched_context: match.term,
  };
}

export function getHakaruRuleTableStatus(): Pick<
  typeof hakaruData,
  "verification_status" | "verified_by" | "verified_at" | "source_sha256"
> {
  return {
    verification_status: hakaruData.verification_status,
    verified_by: hakaruData.verified_by,
    verified_at: hakaruData.verified_at,
    source_sha256: hakaruData.source_sha256,
  };
}
