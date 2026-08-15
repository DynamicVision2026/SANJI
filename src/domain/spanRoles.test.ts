import test from "node:test";
import assert from "node:assert/strict";

import {
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
 * These tests pin the §7.5 span-role policy table verbatim. If the spec table
 * changes, this fixture must be updated deliberately (and SPAN_ROLE_POLICY_VERSION
 * bumped) — that is the point. A silent edit to the policy should fail here.
 *
 * Expected values are transcribed straight from the §7.5 table:
 *   columns: PASS | RUBY_RECOMMENDED | RUBY_REQUIRED | REWRITE_RECOMMENDED | REVIEW_REQUIRED
 */
const EXPECTED: Record<string, SpanAction[]> = {
  target: ["ACCEPT", "ACCEPT", "REJECT", "REJECT", "QUEUE_REVIEW"],
  carrier: ["ACCEPT", "ACCEPT_WITH_RUBY", "ACCEPT_WITH_RUBY", "REGENERATE", "QUEUE_REVIEW"],
  diagnostic_probe: [
    "ACCEPT",
    "ACCEPT_WITH_RUBY",
    "ACCEPT_WITH_RUBY",
    "REGENERATE",
    "QUEUE_REVIEW",
  ],
  static_chrome: [
    "BUILD_TIME_ONLY",
    "BUILD_TIME_ONLY",
    "BUILD_TIME_ONLY",
    "BUILD_FAIL",
    "BUILD_FAIL",
  ],
  proper_noun: ["EXEMPT", "EXEMPT", "EXEMPT", "EXEMPT", "EXEMPT"],
  report_body: ["ACCEPT", "ACCEPT_WITH_RUBY", "ACCEPT_WITH_RUBY", "REGENERATE", "QUEUE_REVIEW"],
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

test("policy table matches §7.5 verbatim for every cell", () => {
  for (const role of SPAN_ROLES) {
    const expectedRow = EXPECTED[role];
    assert.ok(expectedRow, `missing expectation for role ${role}`);
    POLICY_TIERS.forEach((tier, i) => {
      assert.equal(
        policyAction(role, tier),
        expectedRow[i],
        `policy[${role}][${tier}] should be ${expectedRow[i]}`,
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

test("proper_noun is EXEMPT and bypasses the classifier (§7.5)", () => {
  assert.equal(bypassesClassifier("proper_noun"), true);
  assert.equal(bypassesClassifier("target"), false);
  for (const tier of POLICY_TIERS) {
    assert.equal(policyAction("proper_noun", tier), "EXEMPT");
  }
});

test("target never accepts ruby: RUBY_REQUIRED is a hard reject (§7.5)", () => {
  // Ruby over a target span reveals the answer and destroys the item (§7.6).
  assert.equal(policyAction("target", "RUBY_REQUIRED"), "REJECT");
  assert.notEqual(policyAction("target", "RUBY_RECOMMENDED"), "ACCEPT_WITH_RUBY");
});

test("static_chrome is build-time validated and fails the build on REWRITE+ (§7.5)", () => {
  assert.equal(isBuildTimeValidated("static_chrome"), true);
  assert.equal(policyAction("static_chrome", "REWRITE_RECOMMENDED"), "BUILD_FAIL");
  assert.equal(policyAction("static_chrome", "REVIEW_REQUIRED"), "BUILD_FAIL");
});

test("policy version identifier is present (drift detector)", () => {
  assert.match(SPAN_ROLE_POLICY_VERSION, /week1-frozen/);
});
