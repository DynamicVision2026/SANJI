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
 * Validate a persisted RenderPlan before resolution (issue #6 item 6).
 *
 * render_plan is persisted data (items.render_plan, §7.6) — if it is
 * malformed the item is corrupt, and this project prefers loud failure over
 * silent degradation (CLAUDE.md, §9): a span with a garbage `reason` must not
 * quietly behave like `recommended`, and bad offsets must not quietly
 * mis-place or drop ruby. Throws with the span's index and defect.
 */
export function validateRenderPlan(plan: RenderPlan): void {
  const validOffsets = (s: { start: number; end: number }): string | null => {
    if (!Number.isInteger(s.start) || !Number.isInteger(s.end)) return "non-integer offsets";
    if (s.start < 0) return "negative start offset";
    if (s.end <= s.start) return "empty or inverted span (end <= start)";
    return null;
  };
  if (!plan || !Array.isArray(plan.ruby_spans) || !Array.isArray(plan.suppressed_spans)) {
    throw new Error("Malformed RenderPlan: ruby_spans/suppressed_spans must be arrays (§7.6).");
  }
  plan.ruby_spans.forEach((span, i) => {
    const offsetDefect = validOffsets(span);
    if (offsetDefect) {
      throw new Error(`Malformed RenderPlan: ruby_spans[${i}] has ${offsetDefect} (§7.6).`);
    }
    if (span.reason !== "required" && span.reason !== "recommended") {
      throw new Error(
        `Malformed RenderPlan: ruby_spans[${i}] has invalid reason ${JSON.stringify(
          (span as { reason?: unknown }).reason,
        )} — must be "required" or "recommended" verbatim (§7.6). Refusing to guess.`,
      );
    }
    if (typeof span.reading_kana !== "string" || span.reading_kana.length === 0) {
      throw new Error(`Malformed RenderPlan: ruby_spans[${i}] has empty or missing reading_kana (§7.6).`);
    }
  });
  plan.suppressed_spans.forEach((span, i) => {
    const offsetDefect = validOffsets(span);
    if (offsetDefect) {
      throw new Error(`Malformed RenderPlan: suppressed_spans[${i}] has ${offsetDefect} (§7.6).`);
    }
  });
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
  // Persisted data is validated before any resolution decision — a malformed
  // span throws instead of silently behaving like `recommended` (issue #6
  // item 6; loud failure per CLAUDE.md/§9).
  validateRenderPlan(plan);

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
