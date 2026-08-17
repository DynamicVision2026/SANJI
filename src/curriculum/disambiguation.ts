import hakaruData from "./data/hakaru_disambiguation.json";
import toruData from "./data/toru_disambiguation.json";
import tsukuruData from "./data/tsukuru_disambiguation.json";

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

interface LookupRule<Target extends string> {
  id: string;
  target_kanji: Target;
  context_terms: string[];
}

function lookup<Target extends string>(context: string, rulesToSearch: LookupRule<Target>[]) {
  const matches = rulesToSearch.flatMap((rule) =>
    rule.context_terms.filter((term) => context.includes(term)).map((term) => ({ rule, term })),
  );
  const longest = Math.max(0, ...matches.map(({ term }) => term.length));
  const finalists = matches.filter(({ term }) => term.length === longest);
  const targets = new Set(finalists.map(({ rule }) => rule.target_kanji));
  return targets.size === 1 ? finalists[0]! : null;
}

/**
 * Deterministic はかる PoC lookup. Longest matching source term wins; an
 * absent match or a tie across kanji is review-required, never guessed.
 */
export function disambiguateHakaru(context: string): DisambiguationResult {
  const match = lookup(context, rules);
  if (!match) {
    return {
      reading_kana: "はかる",
      target_kanji: null,
      certainty: "REVIEW_REQUIRED",
      source_rule_id: null,
      matched_context: null,
    };
  }

  return {
    reading_kana: "はかる",
    target_kanji: match.rule.target_kanji,
    certainty: "CONFIDENT",
    source_rule_id: match.rule.id,
    matched_context: match.term,
  };
}

export interface ToruDisambiguationResult {
  reading_kana: "とる";
  target_kanji: "取" | "採" | "執" | "撮" | null;
  certainty: DisambiguationCertainty;
  source_rule_id: string | null;
  matched_context: string | null;
}

export function disambiguateToru(context: string): ToruDisambiguationResult {
  const match = lookup(context, toruData.rules as LookupRule<"取" | "採" | "執" | "撮">[]);
  return match
    ? {
        reading_kana: "とる",
        target_kanji: match.rule.target_kanji,
        certainty: "CONFIDENT",
        source_rule_id: match.rule.id,
        matched_context: match.term,
      }
    : {
        reading_kana: "とる",
        target_kanji: null,
        certainty: "REVIEW_REQUIRED",
        source_rule_id: null,
        matched_context: null,
      };
}

export interface TsukuruDisambiguationResult {
  reading_kana: "つくる";
  target_kanji: "作" | "創" | "造" | null;
  certainty: DisambiguationCertainty;
  source_rule_id: string | null;
  matched_context: string | null;
}

export function disambiguateTsukuru(context: string): TsukuruDisambiguationResult {
  const match = lookup(context, tsukuruData.rules as LookupRule<"作" | "創" | "造">[]);
  return match
    ? {
        reading_kana: "つくる",
        target_kanji: match.rule.target_kanji,
        certainty: "CONFIDENT",
        source_rule_id: match.rule.id,
        matched_context: match.term,
      }
    : {
        reading_kana: "つくる",
        target_kanji: null,
        certainty: "REVIEW_REQUIRED",
        source_rule_id: null,
        matched_context: null,
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
