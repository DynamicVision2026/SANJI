/**
 * Span roles and action policy (spec §7.5) — FROZEN at end of Week 1 (§18).
 *
 * This module is the contract between the L3 classifier (§7.4) and every
 * consumer: the gate policy (§7.7), the RenderPlan derivation (§7.6), and the
 * corpus retrieval key (§7.8). Downstream work depends on these identifiers and
 * on the exact per-cell policy below. Treat this file as versioned: changing a
 * role name or a policy cell is a breaking change to that contract, not a
 * refactor.
 *
 * The policy table is transcribed verbatim from the §7.5 table. Do not fold,
 * simplify, or "optimise" the cells — the whole point of freezing it is that
 * the mapping is explicit and auditable.
 *
 * ---------------------------------------------------------------------------
 * OPEN QUESTIONS — spec §19.3 ("closes end of Week 1"). These are recorded as
 * genuinely unresolved. Do NOT resolve them unilaterally in code; they need a
 * coordinator/pilot decision. See the TODOs at their point of impact below.
 *   1. Should `diagnostic_probe` bypass L4 naturalness as well as the grade
 *      gate? Current spec (§7.5 / §7.9) says NO — naturalness still applies.
 *   2. Should the answer key carry ruby on the revealed answer to assist the
 *      instructor? Pilot feedback should decide.
 * ---------------------------------------------------------------------------
 */

import type { PolicyTier } from "./tiers";
import { POLICY_TIERS } from "./tiers";

/** The six span roles (§7.5). Order matches the spec table top-to-bottom. */
export const SPAN_ROLES = [
  "target",
  "carrier",
  "diagnostic_probe",
  "static_chrome",
  "proper_noun",
  "report_body",
] as const;

export type SpanRole = (typeof SPAN_ROLES)[number];

/**
 * The distinct actions that appear as cells in the §7.5 table. Each maps to one
 * cell value; the mapping to the wording in the spec is noted on each member.
 */
export const SPAN_ACTIONS = [
  "ACCEPT", //            "✓" — usable as-is, no ruby applied to this span
  "ACCEPT_WITH_RUBY", //  "✓ (ruby applied)" — usable; RenderPlan places ruby here
  "REGENERATE", //        "regenerate" — request a new generation
  "REJECT", //            "reject" — the item cannot be valid for this role; drop it
  "QUEUE_REVIEW", //      "queue" — enqueue async review; live path never blocks (§7.7)
  "BUILD_TIME_ONLY", //   "build-time only" — validated once at build against Grade 1
  "BUILD_FAIL", //        static_chrome "reject": REWRITE_RECOMMENDED-or-worse fails the build
  "EXEMPT", //            "EXEMPT" / "—" — bypasses the classifier entirely
] as const;

export type SpanAction = (typeof SPAN_ACTIONS)[number];

/**
 * Roles that never enter the classifier at all. `proper_noun` is EXEMPT and
 * MUST bypass the classifier entirely (§7.5) — running a customer's own name
 * (e.g. 髙木ゼミナール) through it would produce a permanent REVIEW_REQUIRED on
 * their branding. Glyph coverage for these is a §9.5 concern, not a reading
 * concern.
 *
 * NOTE: instructor UI text is also outside the classifier boundary (§7.5), but
 * it is deliberately NOT a role here — it is not part of the pipeline at all.
 * Any code path routing UI strings into reading analysis is a defect.
 */
export const CLASSIFIER_BYPASS_ROLES: readonly SpanRole[] = ["proper_noun"];

export function bypassesClassifier(role: SpanRole): boolean {
  return CLASSIFIER_BYPASS_ROLES.includes(role);
}

/**
 * Roles validated once at build time rather than per render (§7.5). For
 * `static_chrome` this validation runs against the lowest supported grade
 * (Grade 1) because it is author-controlled static text.
 */
export function isBuildTimeValidated(role: SpanRole): boolean {
  return role === "static_chrome";
}

type PolicyRow = Readonly<Record<PolicyTier, SpanAction>>;

/**
 * The §7.5 action policy, one row per role, one column per policy tier.
 * Transcribed verbatim from the spec table (EXEMPT tier is excluded from the
 * columns because an EXEMPT span never reaches policy — see tiers.ts).
 */
export const SPAN_ROLE_POLICY: Readonly<Record<SpanRole, PolicyRow>> = {
  // The span being tested. Cannot carry ruby — ruby would reveal the answer,
  // so RUBY_REQUIRED is a hard reject (not "apply ruby").
  target: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT", // accepted bare; ruby is NOT placed on a target
    RUBY_REQUIRED: "REJECT",
    REWRITE_RECOMMENDED: "REJECT",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
  // Generated text surrounding the target. Ruby may be applied here.
  carrier: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT_WITH_RUBY",
    RUBY_REQUIRED: "ACCEPT_WITH_RUBY",
    REWRITE_RECOMMENDED: "REGENERATE",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
  // Diagnostic items deliberately probing above assumed grade. The grade gate
  // is inverted (grade-appropriateness does not gate this role), so above-grade
  // content is accepted with ruby rather than rejected.
  //
  // TODO(spec §19.3, closes end of Week 1): naturalness (§7.9 L4) currently
  // STILL applies to diagnostic_probe (see §7.9 — "Applies to all roles
  // including diagnostic_probe"). Open question is whether a probe using rare
  // vocabulary should be allowed to bypass L4 naturalness too. Do not change
  // this behaviour without a coordinator decision.
  diagnostic_probe: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT_WITH_RUBY",
    RUBY_REQUIRED: "ACCEPT_WITH_RUBY",
    REWRITE_RECOMMENDED: "REGENERATE",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
  // Fixed instructions / section labels / field names printed on the worksheet.
  // Validated once at build time against Grade 1. REWRITE_RECOMMENDED or worse
  // fails the build rather than queueing (§7.5).
  static_chrome: {
    PASS: "BUILD_TIME_ONLY",
    RUBY_RECOMMENDED: "BUILD_TIME_ONLY",
    RUBY_REQUIRED: "BUILD_TIME_ONLY",
    REWRITE_RECOMMENDED: "BUILD_FAIL",
    REVIEW_REQUIRED: "BUILD_FAIL",
  },
  // User-supplied names (branch, student, instructor comment names). EXEMPT —
  // MUST bypass the classifier entirely; these cells should never be reached
  // because a proper_noun span is not classified. Encoded as EXEMPT so a
  // lookup that wrongly happens is still unambiguous.
  proper_noun: {
    PASS: "EXEMPT",
    RUBY_RECOMMENDED: "EXEMPT",
    RUBY_REQUIRED: "EXEMPT",
    REWRITE_RECOMMENDED: "EXEMPT",
    REVIEW_REQUIRED: "EXEMPT",
  },
  // Parent report prose. Adult reader — every tier is usable.
  //
  // TODO(spec §19.3, closes end of Week 1): whether the answer key shows ruby
  // on revealed answers is a separate open question for pilot feedback; it is
  // an answer-key rendering decision, not a report_body policy change. Tracked
  // here so the RenderPlan work (§7.6) does not silently pick a default.
  report_body: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT_WITH_RUBY",
    RUBY_REQUIRED: "ACCEPT_WITH_RUBY",
    REWRITE_RECOMMENDED: "REGENERATE",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
};

/**
 * Look up the frozen §7.5 action for a (role, tier) pair. For roles that bypass
 * the classifier (proper_noun) this returns EXEMPT for any tier, but callers
 * SHOULD short-circuit on {@link bypassesClassifier} before ever classifying.
 */
export function policyAction(role: SpanRole, tier: PolicyTier): SpanAction {
  return SPAN_ROLE_POLICY[role][tier];
}

/**
 * A frozen, versioned identifier for the policy contract. Bump this only when
 * the §7.5 table itself changes (which is a breaking change for the classifier
 * and every consumer). Consumers may assert against it to detect drift.
 */
export const SPAN_ROLE_POLICY_VERSION = "1.0.0-week1-frozen";

/** All policy tiers, re-exported for consumers building exhaustive checks. */
export { POLICY_TIERS };
