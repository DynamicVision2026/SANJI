/**
 * Conditional ruby resolution (spec v2.3 §9.6), consuming the persisted
 * RenderPlan (§7.6).
 *
 * Ruby placement is driven SOLELY by the persisted RenderPlan — never by grade
 * heuristics recomputed from student state at render time. This module is the
 * single implementation of the §9.6 decision table; the rendering container
 * (Weeks 5–6, §18.1) consumes its output verbatim.
 *
 * Decision order (§9.6, in precedence order):
 *   1. `suppressed_spans` render WITHOUT ruby under all conditions — they
 *      override everything below, at every tier and policy setting. A ruby
 *      annotation over a `target` span reveals the answer (§7.6).
 *   2. `reason: required` spans always render ruby.
 *   3. `reason: recommended` spans render conditionally per the org's
 *      `ruby_policy`:
 *        conservative (default) — apply when itemGrade ≤ boundary (default 3)
 *        always                 — apply regardless of grade
 *        minimal                — never apply
 *
 * Rationale (§9.6): textbooks withdraw furigana as grade rises; over-annotation
 * turns kanji practice into a reading crutch. RUBY_RECOMMENDED means "permitted
 * and probably helpful", not "mandatory"; RUBY_REQUIRED means unreadable
 * without it.
 *
 * The grade boundary is runtime configuration (§7.10, default 3 pending pilot
 * validation §19.5) — pass it from getRuntimeConfig().rubyGradeBoundary.
 */

/** §5.1 organizations.ruby_policy. */
export const RUBY_POLICIES = ["conservative", "always", "minimal"] as const;
export type RubyPolicy = (typeof RUBY_POLICIES)[number];

export function isRubyPolicy(value: string): value is RubyPolicy {
  return (RUBY_POLICIES as readonly string[]).includes(value);
}

/** §7.6 RenderPlan entries. `reason` is preserved verbatim from validation. */
export interface RubySpan {
  start: number;
  end: number;
  reading_kana: string;
  reason: "required" | "recommended";
}

export interface SuppressedSpan {
  start: number;
  end: number;
}

/** §7.6 RenderPlan — computed at validation time, persisted on the item. */
export interface RenderPlan {
  ruby_spans: RubySpan[];
  suppressed_spans: SuppressedSpan[];
}

/** Half-open overlap test on character offsets ([start, end)). */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Resolve which ruby spans actually render for an item under the org's policy.
 *
 * A renderer that ignores `reason` is a defect (§7.6); this function is where
 * `reason` is consumed. The returned spans are the ONLY spans on which ruby
 * may render.
 */
export function resolveRubySpans(
  plan: RenderPlan,
  itemGrade: number,
  policy: RubyPolicy,
  gradeBoundary: number,
): RubySpan[] {
  if (!isRubyPolicy(policy)) {
    // Unreachable through typed callers; guards untyped DB values (fail loud).
    throw new Error(`Unknown ruby_policy ${JSON.stringify(policy)} (§9.6).`);
  }
  if (!Number.isInteger(itemGrade) || itemGrade < 1 || itemGrade > 6) {
    throw new Error(`items.grade must be an integer 1..6, got ${itemGrade} (§9.6).`);
  }
  if (!Number.isInteger(gradeBoundary) || gradeBoundary < 1 || gradeBoundary > 6) {
    throw new Error(`ruby grade boundary must be an integer 1..6, got ${gradeBoundary} (§7.10/§9.6).`);
  }

  return plan.ruby_spans.filter((span) => {
    // 1. Suppression overrides everything, unconditionally — including
    //    reason: required, at every tier and policy setting (§7.6, §9.6).
    if (plan.suppressed_spans.some((s) => overlaps(span, s))) return false;

    // 2. Required always renders.
    if (span.reason === "required") return true;

    // 3. Recommended renders per ruby_policy.
    switch (policy) {
      case "always":
        return true;
      case "minimal":
        return false;
      case "conservative":
        return itemGrade <= gradeBoundary;
    }
  });
}
