import test from "node:test";
import assert from "node:assert/strict";

import {
  RUBY_POLICIES,
  resolveRubySpans,
  type RenderPlan,
  type RubySpan,
} from "./ruby";

const required: RubySpan = { start: 0, end: 2, reading_kana: "きゅう", reason: "required" };
const recommended: RubySpan = { start: 5, end: 7, reading_kana: "みや", reason: "recommended" };

function plan(overrides: Partial<RenderPlan> = {}): RenderPlan {
  return {
    ruby_spans: [required, recommended],
    suppressed_spans: [],
    ...overrides,
  };
}

test("reason: required always renders, at every policy and grade (§9.6)", () => {
  for (const policy of RUBY_POLICIES) {
    for (const grade of [1, 2, 3, 4, 5, 6]) {
      const resolved = resolveRubySpans(plan(), grade, policy, 3);
      assert.ok(
        resolved.some((s) => s.reason === "required"),
        `required span must render under ${policy}/grade ${grade}`,
      );
    }
  }
});

test("conservative: recommended renders at grade ≤ 3, suppressed at ≥ 4 (§9.6 default)", () => {
  for (const grade of [1, 2, 3]) {
    const resolved = resolveRubySpans(plan(), grade, "conservative", 3);
    assert.ok(resolved.includes(recommended), `grade ${grade} should render recommended ruby`);
  }
  for (const grade of [4, 5, 6]) {
    const resolved = resolveRubySpans(plan(), grade, "conservative", 3);
    assert.ok(!resolved.includes(recommended), `grade ${grade} should suppress recommended ruby`);
  }
});

test("always: recommended renders regardless of grade (§9.6)", () => {
  for (const grade of [1, 6]) {
    assert.ok(resolveRubySpans(plan(), grade, "always", 3).includes(recommended));
  }
});

test("minimal: recommended never renders; required still does (§9.6)", () => {
  for (const grade of [1, 6]) {
    const resolved = resolveRubySpans(plan(), grade, "minimal", 3);
    assert.ok(!resolved.includes(recommended));
    assert.ok(resolved.includes(required));
  }
});

test("suppressed_spans override EVERYTHING — required included, every policy, every grade (§7.6)", () => {
  // Ruby must never render on a target span under any configuration. This is
  // the unconditional invariant; test it exhaustively across the matrix.
  const suppressedPlan = plan({
    suppressed_spans: [
      { start: 1, end: 2 }, // overlaps `required` (0..2)
      { start: 6, end: 7 }, // overlaps `recommended` (5..7)
    ],
  });
  for (const policy of RUBY_POLICIES) {
    for (const grade of [1, 2, 3, 4, 5, 6]) {
      const resolved = resolveRubySpans(suppressedPlan, grade, policy, 3);
      assert.deepEqual(
        resolved,
        [],
        `no ruby may render over a suppressed span (policy=${policy}, grade=${grade})`,
      );
    }
  }
});

test("partial overlap with a suppressed span suppresses the ruby span", () => {
  const p = plan({ suppressed_spans: [{ start: 6, end: 10 }] }); // clips recommended (5..7)
  const resolved = resolveRubySpans(p, 1, "always", 3);
  assert.ok(!resolved.includes(recommended));
  assert.ok(resolved.includes(required));
});

test("adjacent (non-overlapping) suppressed span does not suppress", () => {
  // Half-open ranges: suppression [7, 9) does not touch recommended [5, 7).
  const p = plan({ suppressed_spans: [{ start: 7, end: 9 }] });
  assert.ok(resolveRubySpans(p, 1, "always", 3).includes(recommended));
});

test("grade boundary is configurable, not a constant (§7.10)", () => {
  // Boundary 4: grade 4 now renders recommended ruby under conservative.
  assert.ok(resolveRubySpans(plan(), 4, "conservative", 4).includes(recommended));
  // Boundary 1: grade 2 no longer does.
  assert.ok(!resolveRubySpans(plan(), 2, "conservative", 1).includes(recommended));
});

test("invalid inputs fail loudly", () => {
  assert.throws(() => resolveRubySpans(plan(), 0, "conservative", 3), /items\.grade/);
  assert.throws(() => resolveRubySpans(plan(), 3, "conservative", 0), /grade boundary/);
  assert.throws(
    () => resolveRubySpans(plan(), 3, "sometimes" as never, 3),
    /Unknown ruby_policy/,
  );
});

// ---------------------------------------------------------------------------
// Issue #6 item 6 — malformed PERSISTED plans must throw, never silently
// degrade. Before this fix, a span with reason "Required"/undefined/garbage
// fell through the required-check and behaved as `recommended`.
// ---------------------------------------------------------------------------

test("malformed reason throws instead of silently behaving as recommended (issue #6 item 6)", () => {
  for (const badReason of ["Required", "REQUIRED", "sometimes", "", undefined, null, 3]) {
    const p = plan({
      ruby_spans: [{ start: 0, end: 2, reading_kana: "きゅう", reason: badReason as never }],
    });
    assert.throws(
      () => resolveRubySpans(p, 1, "always", 3),
      /invalid reason/,
      `reason=${JSON.stringify(badReason)} must throw`,
    );
  }
});

test("malformed offsets throw: non-integer, negative, empty, inverted (issue #6 item 6)", () => {
  const shapes: Array<[number, number, RegExp]> = [
    [0.5, 2, /non-integer/],
    [-1, 2, /negative start/],
    [2, 2, /end <= start/],
    [3, 1, /end <= start/],
  ];
  for (const [start, end, expected] of shapes) {
    const p = plan({
      ruby_spans: [{ start, end, reading_kana: "き", reason: "required" }],
    });
    assert.throws(() => resolveRubySpans(p, 1, "always", 3), expected);
  }
  // Suppressed spans get the same offset validation.
  const badSuppressed = plan({ suppressed_spans: [{ start: 5, end: 5 }] });
  assert.throws(() => resolveRubySpans(badSuppressed, 1, "always", 3), /suppressed_spans\[0\]/);
});

test("empty/missing reading_kana on a ruby span throws (issue #6 item 6)", () => {
  const p = plan({
    ruby_spans: [{ start: 0, end: 2, reading_kana: "", reason: "required" }],
  });
  assert.throws(() => resolveRubySpans(p, 1, "always", 3), /reading_kana/);
});

test("non-array plan members throw", () => {
  assert.throws(
    () =>
      resolveRubySpans(
        { ruby_spans: undefined, suppressed_spans: [] } as unknown as RenderPlan,
        1,
        "always",
        3,
      ),
    /must be arrays/,
  );
});
