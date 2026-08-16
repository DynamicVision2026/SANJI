/**
 * Font Integrity Gate canary content (spec v2.3 §15.3).
 *
 * §15.3 requires rendering a canary containing: all 1,026 kyōiku kanji, the
 * configured `allowed_with_ruby` extension set, full kana, permitted
 * punctuation, ruby-annotated spans under EACH `ruby_policy` value, and a
 * proper-noun fixture set including 髙 﨑 濵 邊 — then asserting exactly one
 * embedded font in the output PDF.
 *
 * This module builds that canary CONTENT deterministically from the real
 * curriculum data and the real §9.6 resolver, so the fixture cannot drift from
 * the character sets or the policy logic it must exercise. The PDF render +
 * font-resource-dictionary assertion consumes this once the rendering
 * container exists (Weeks 5–6, §18.1; placeholder font per §9.2). Until then
 * the canary content itself is under test (fontCanary.test.ts) — the gate's
 * render half is honestly not implemented yet.
 */

import kanjiTeachGrade from "../curriculum/data/kanji_teach_grade.json";
import { RUBY_POLICIES, resolveRubySpans, type RenderPlan, type RubyPolicy, type RubySpan } from "./ruby";

/** §9.5 proper-noun fixture set — 異体字/環境依存文字 named by §15.3. */
export const PROPER_NOUN_FIXTURES = ["髙", "﨑", "濵", "邊"] as const;

/** §7.2 permitted punctuation plus iteration/long-vowel marks. */
export const PERMITTED_PUNCTUATION = "、。「」！？々ー";

function kanaRange(first: number, last: number): string {
  let out = "";
  for (let code = first; code <= last; code++) out += String.fromCharCode(code);
  return out;
}

/**
 * The complete kana repertoire the canary must cover (issue #6 item 7 —
 * defined explicitly so "full kana" is a checkable claim, not a vibe):
 *   - hiragana letters ぁ..ゖ (U+3041–U+3096)
 *   - hiragana iteration marks ゝ ゞ (U+309D–U+309E)
 *   - katakana letters ァ..ヺ (U+30A1–U+30FA)
 *   - katakana iteration marks ヽ ヾ (U+30FD–U+30FE)
 * The long-vowel mark ー (U+30FC) is carried in PERMITTED_PUNCTUATION (§7.2
 * lists it alongside 々), not here.
 */
export const FULL_KANA =
  kanaRange(0x3041, 0x3096) + // hiragana
  "ゝゞ" + //                    hiragana iteration marks (U+309D, U+309E)
  kanaRange(0x30a1, 0x30fa) + // katakana
  "ヽヾ"; //                     katakana iteration marks (U+30FD, U+30FE)

export interface CanaryPolicyRendering {
  policy: RubyPolicy;
  itemGrade: number;
  /** Spans that actually render ruby under this policy/grade (§9.6). */
  renderedSpans: RubySpan[];
}

export interface FontCanary {
  /** Every character the subset must cover, §15.3's enumeration. */
  text: string;
  /** The fixture RenderPlan the policy renderings are resolved from. */
  plan: RenderPlan;
  /** Ruby resolution under each ruby_policy value at each side of the boundary. */
  policyRenderings: CanaryPolicyRendering[];
}

/**
 * Build the §15.3 canary from the frozen curriculum data plus configuration.
 *
 * @param allowedWithRubyExtensions the configured 常用 extension characters
 *        (RuntimeConfig.allowedWithRubyExtensions)
 * @param gradeBoundary the configured conservative-policy grade boundary
 *        (RuntimeConfig.rubyGradeBoundary)
 */
export function buildFontCanary(
  allowedWithRubyExtensions: readonly string[] = [],
  gradeBoundary = 3,
): FontCanary {
  const kyoiku = (kanjiTeachGrade as Array<{ kanji: string }>).map((row) => row.kanji);

  const text =
    kyoiku.join("") +
    allowedWithRubyExtensions.join("") +
    FULL_KANA +
    PERMITTED_PUNCTUATION +
    "0123456789" +
    PROPER_NOUN_FIXTURES.join("");

  // Fixture plan: one required span, one recommended span, one suppressed
  // (target) span that overlaps a would-be ruby span — the §7.6 invariant must
  // hold in the canary exactly as in production.
  const plan: RenderPlan = {
    ruby_spans: [
      { start: 0, end: 2, reading_kana: "かんじ", reason: "required" },
      { start: 3, end: 5, reading_kana: "れんしゅう", reason: "recommended" },
      { start: 6, end: 7, reading_kana: "みや", reason: "required" }, // overlaps suppression below
    ],
    suppressed_spans: [{ start: 6, end: 7 }],
  };

  // §15.3: ruby-annotated spans under each ruby_policy value. Resolve at a
  // grade on each side of the boundary so `conservative` exercises both arms.
  const grades = [
    Math.max(1, gradeBoundary),
    Math.min(6, gradeBoundary + 1),
  ];
  const policyRenderings: CanaryPolicyRendering[] = [];
  for (const policy of RUBY_POLICIES) {
    for (const itemGrade of grades) {
      policyRenderings.push({
        policy,
        itemGrade,
        renderedSpans: resolveRubySpans(plan, itemGrade, policy, gradeBoundary),
      });
    }
  }

  return { text, plan, policyRenderings };
}
