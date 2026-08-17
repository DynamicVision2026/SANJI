import akuAkeruData from "./data/aku_akeru_disambiguation.json";
import agaruAgeruData from "./data/agaru_ageru_disambiguation.json";
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

const singleKanji = /^\p{Script=Han}$/u;

function containsContextTerm(context: string, term: string): boolean {
  if ([...term].length !== 1 || !singleKanji.test(term)) return context.includes(term);

  let index = context.indexOf(term);
  while (index !== -1) {
    const previous = [...context.slice(0, index)].at(-1);
    const next = [...context.slice(index + term.length)][0];
    if ((!previous || !singleKanji.test(previous)) && (!next || !singleKanji.test(next))) return true;
    index = context.indexOf(term, index + term.length);
  }
  return false;
}

function lookup<Target extends string>(
  context: string,
  rulesToSearch: LookupRule<Target>[],
  verificationStatus: string,
) {
  if (verificationStatus !== "frozen") return null;
  const normalizedContext = context.normalize("NFC");
  const matches = rulesToSearch.flatMap((rule) =>
    rule.context_terms.flatMap((term) => {
      const normalizedTerm = term.normalize("NFC");
      return containsContextTerm(normalizedContext, normalizedTerm) ? [{ rule, term: normalizedTerm }] : [];
    }),
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
  const match = lookup(context, rules, hakaruData.verification_status);
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
  target_kanji: "取" | "採" | "執" | "捕" | "撮" | null;
  certainty: DisambiguationCertainty;
  source_rule_id: string | null;
  matched_context: string | null;
}

export function disambiguateToru(context: string): ToruDisambiguationResult {
  const match = lookup(
    context,
    toruData.rules as LookupRule<"取" | "採" | "執" | "捕" | "撮">[],
    toruData.verification_status,
  );
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
  const match = lookup(
    context,
    tsukuruData.rules as LookupRule<"作" | "創" | "造">[],
    tsukuruData.verification_status,
  );
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

export type AkuAkeruReading = "あく" | "あける";

export interface AkuAkeruDisambiguationResult {
  reading_kana: AkuAkeruReading;
  target_kanji: "明" | "空" | "開" | null;
  certainty: DisambiguationCertainty;
  source_rule_id: string | null;
  matched_context: string | null;
}

export function disambiguateAkuAkeru(
  context: string,
  readingKana: AkuAkeruReading,
): AkuAkeruDisambiguationResult {
  if (readingKana !== "あく" && readingKana !== "あける") throw new Error(`Unsupported reading: ${readingKana}`);
  const eligible = akuAkeruData.rules.filter((rule) => rule.reading_kana.includes(readingKana));
  const match = lookup(context, eligible as LookupRule<"明" | "空" | "開">[], akuAkeruData.verification_status);
  return match
    ? {
        reading_kana: readingKana,
        target_kanji: match.rule.target_kanji,
        certainty: "CONFIDENT",
        source_rule_id: match.rule.id,
        matched_context: match.term,
      }
    : {
        reading_kana: readingKana,
        target_kanji: null,
        certainty: "REVIEW_REQUIRED",
        source_rule_id: null,
        matched_context: null,
      };
}

export type AgaruAgeruReading = "あがる" | "あげる";

export interface AgaruAgeruDisambiguationResult {
  reading_kana: AgaruAgeruReading;
  target_kanji: "上" | "揚" | "挙" | null;
  certainty: DisambiguationCertainty;
  source_rule_id: string | null;
  matched_context: string | null;
}

export function disambiguateAgaruAgeru(
  context: string,
  readingKana: AgaruAgeruReading,
): AgaruAgeruDisambiguationResult {
  if (readingKana !== "あがる" && readingKana !== "あげる") throw new Error(`Unsupported reading: ${readingKana}`);
  const eligible = agaruAgeruData.rules.filter((rule) => rule.reading_kana.includes(readingKana));
  const match = lookup(context, eligible as LookupRule<"上" | "揚" | "挙">[], agaruAgeruData.verification_status);
  return match
    ? {
        reading_kana: readingKana,
        target_kanji: match.rule.target_kanji,
        certainty: "CONFIDENT",
        source_rule_id: match.rule.id,
        matched_context: match.term,
      }
    : {
        reading_kana: readingKana,
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
