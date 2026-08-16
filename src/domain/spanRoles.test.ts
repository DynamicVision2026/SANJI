import test from "node:test";
import assert from "node:assert/strict";

import {
  SPAN_ACTIONS,
  SPAN_ROLES,
  SPAN_ROLE_POLICY,
  SPAN_ROLE_POLICY_VERSION,
  bypassesClassifier,
  isBuildTimeValidated,
  policyAction,
  type SpanAction,
} from "./spanRoles";
import { POLICY_TIERS, TIERS } from "./tiers";

/**
 * These tests pin the §7.5 span-role policy table verbatim, transcribed from
 * the SPEC TABLE (v2.3 §7.5), not from the implementation. That distinction is
 * the lesson of the 1.0.0 defect: the original test was written against the
 * implementation and therefore locked in three transcription errors instead of
 * catching them. If the spec table changes, this fixture must be updated
 * deliberately (and SPAN_ROLE_POLICY_VERSION bumped) — a silent edit to the
 * policy should fail here.
 *
 * Spec table (v2.3 §7.5), columns PASS | RUBY_REC | RUBY_REQ | REWRITE_REC | REVIEW_REQ:
 *   target           : ✓ | ✓ | reject | reject | queue
 *   carrier          : ✓ | ✓ | ✓ | regenerate | queue
 *   diagnostic_probe : ✓ | ✓ | ✓ | ✓ | queue
 *   static_chrome    : build-time only ×3 | reject(build) | reject(build)
 *   proper_noun      : EXEMPT row
 *   report_body      : ✓ | ✓ | ✓ | ✓ | ✓
 */
const EXPECTED: Record<string, SpanAction[]> = {
  target: ["ACCEPT", "ACCEPT", "REJECT", "REJECT", "QUEUE_REVIEW"],
  carrier: ["ACCEPT", "ACCEPT", "ACCEPT", "REGENERATE", "QUEUE_REVIEW"],
  diagnostic_probe: ["ACCEPT", "ACCEPT", "ACCEPT", "ACCEPT", "QUEUE_REVIEW"],
  static_chrome: [
    "BUILD_TIME_ONLY",
    "BUILD_TIME_ONLY",
    "BUILD_TIME_ONLY",
    "BUILD_FAIL",
    "BUILD_FAIL",
  ],
  proper_noun: ["EXEMPT", "EXEMPT", "EXEMPT", "EXEMPT", "EXEMPT"],
  report_body: ["ACCEPT", "ACCEPT", "ACCEPT", "ACCEPT", "ACCEPT"],
};

test("exactly the six §7.5 roles are defined", () => {
  assert.deepEqual([...SPAN_ROLES].sort(), [
    "carrier",
    "diagnostic_probe",
    "proper_noun",
    "report_body",
    "static_chrome",
    "target",
  ]);
});

test("tier enum lists all six §7.4 tiers, lowest→highest risk", () => {
  assert.deepEqual(
    [...TIERS],
    ["PASS", "RUBY_RECOMMENDED", "RUBY_REQUIRED", "REWRITE_RECOMMENDED", "REVIEW_REQUIRED", "EXEMPT"],
  );
});

test("policy table matches the v2.3 §7.5 spec table verbatim, cell by cell", () => {
  for (const role of SPAN_ROLES) {
    const expectedRow = EXPECTED[role];
    assert.ok(expectedRow, `missing expectation for role ${role}`);
    POLICY_TIERS.forEach((tier, i) => {
      assert.equal(
        policyAction(role, tier),
        expectedRow[i],
        `policy[${role}][${tier}] should be ${expectedRow[i]} per §7.5`,
      );
    });
  }
});

test("every role has an action for every policy tier (no gaps)", () => {
  for (const role of SPAN_ROLES) {
    for (const tier of POLICY_TIERS) {
      assert.ok(SPAN_ROLE_POLICY[role][tier], `gap at ${role}/${tier}`);
    }
  }
});

test("no policy action implies ruby application (v2.3 §7.5 ✓-semantics)", () => {
  // ✓ = tier acceptability. Ruby application is decided solely by §9.6 from
  // the persisted RenderPlan. An action like ACCEPT_WITH_RUBY would put a
  // rendering decision inside the policy table — v2.3 removed exactly that.
  assert.deepEqual(
    [...SPAN_ACTIONS],
    ["ACCEPT", "REGENERATE", "REJECT", "QUEUE_REVIEW", "BUILD_TIME_ONLY", "BUILD_FAIL", "EXEMPT"],
  );
});

test("target row: RUBY_REQUIRED is a hard reject; RUBY_RECOMMENDED ships bare (§7.5)", () => {
  // Ruby never renders on a target span at any tier — suppressed_spans is
  // unconditional (§7.6). RUBY_REQUIRED is rejected because the span would be
  // unreadable and cannot be annotated.
  assert.equal(policyAction("target", "RUBY_REQUIRED"), "REJECT");
  assert.equal(policyAction("target", "RUBY_RECOMMENDED"), "ACCEPT");
  assert.equal(policyAction("target", "REWRITE_RECOMMENDED"), "REJECT");
});

test("diagnostic_probe accepts REWRITE_RECOMMENDED — the grade gate is inverted (§7.5)", () => {
  // This is the cell the 1.0.0 transcription got wrong (coded REGENERATE).
  // A probe deliberately uses above-stage content; rejecting or regenerating
  // it would make the instrument unable to measure above the assumed grade.
  assert.equal(policyAction("diagnostic_probe", "REWRITE_RECOMMENDED"), "ACCEPT");
  assert.equal(policyAction("diagnostic_probe", "REVIEW_REQUIRED"), "QUEUE_REVIEW");
});

test("report_body accepts every tier — adult reader (§7.5)", () => {
  // These are the cells the 1.0.0 transcription got wrong (coded
  // REGENERATE / QUEUE_REVIEW). The spec row is ✓ across all five tiers.
  for (const tier of POLICY_TIERS) {
    assert.equal(policyAction("report_body", tier), "ACCEPT", `report_body/${tier}`);
  }
});

test("proper_noun is EXEMPT and bypasses the classifier (§7.5)", () => {
  assert.equal(bypassesClassifier("proper_noun"), true);
  assert.equal(bypassesClassifier("target"), false);
  for (const tier of POLICY_TIERS) {
    assert.equal(policyAction("proper_noun", tier), "EXEMPT");
  }
});

test("static_chrome is build-time validated and fails the build on REWRITE+ (§7.5)", () => {
  assert.equal(isBuildTimeValidated("static_chrome"), true);
  assert.equal(policyAction("static_chrome", "REWRITE_RECOMMENDED"), "BUILD_FAIL");
  assert.equal(policyAction("static_chrome", "REVIEW_REQUIRED"), "BUILD_FAIL");
});

test("policy version reflects the 1.1.0 correction (drift detector)", () => {
  assert.equal(SPAN_ROLE_POLICY_VERSION, "1.1.0-week1-frozen");
});
