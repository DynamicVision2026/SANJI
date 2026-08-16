/**
 * Span roles and action policy (spec v2.3 §7.5) — FROZEN at end of Week 1 (§18).
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
 * READING THE TABLE (v2.3 §7.5, clarified before freeze): a ✓ cell denotes
 * that the tier is ACCEPTABLE for that role. It does NOT denote that ruby is
 * applied. Ruby application is decided solely by §9.6 from the persisted
 * RenderPlan — never by this policy table. Accordingly there is no
 * "accept with ruby" action here: ✓ maps to ACCEPT, full stop.
 * Ruby NEVER renders on a `target` span at any tier — §7.6's
 * `suppressed_spans` override is unconditional.
 *
 * ---------------------------------------------------------------------------
 * OPEN QUESTIONS — spec §19.3 ("closes end of Week 1"). These are recorded as
 * genuinely unresolved. Do NOT resolve them unilaterally in code; they need a
 * coordinator/pilot decision. See the TODOs at their point of impact below.
 *   1. Should `diagnostic_probe` bypass L4 naturalness as well as the grade
 *      gate? Current spec (§7.5 / §7.9) says NO — naturalness still applies.
 *   2. Should the answer key carry ruby on the revealed answer to assist the
 *      instructor? Per v2.3 §19.3 this is a rendering question about the
 *      answer-key document, not a change to §7.6's suppression rule for the
 *      worksheet. Pilot feedback should decide.
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
 *
 * NOTE (v2.3): there is deliberately no "accept with ruby" action. A ✓ means
 * the tier is acceptable for the role; whether ruby renders on a span is
 * decided by §9.6 from the persisted RenderPlan, not by this table.
 */
export const SPAN_ACTIONS = [
  "ACCEPT", //            "✓" — the tier is acceptable for this role
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
 * Transcribed verbatim from the v2.3 spec table (EXEMPT tier is excluded from
 * the columns because an EXEMPT span never reaches policy — see tiers.ts).
 *
 * History: version 1.0.0 of this table contained three transcription defects
 * against the spec (diagnostic_probe/REWRITE_RECOMMENDED and both
 * report_body/REWRITE_RECOMMENDED + REVIEW_REQUIRED were coded as
 * regenerate/queue where the spec table has ✓). Caught by external review;
 * corrected in 1.1.0. The spec table itself did not change between v2.2 and
 * v2.3 apart from removing the "(ruby applied)" annotation on the carrier row.
 */
export const SPAN_ROLE_POLICY: Readonly<Record<SpanRole, PolicyRow>> = {
  // §7.5: | `target` | ✓ | ✓ | **reject** | reject | queue |
  // The span being tested. Ruby never renders here (suppressed_spans is
  // unconditional, §7.6); the ✓ under RUBY_RECOMMENDED means such an item may
  // ship, not that the answer may be annotated. RUBY_REQUIRED is rejected
  // because the span would be unreadable and cannot be annotated.
  target: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT",
    RUBY_REQUIRED: "REJECT",
    REWRITE_RECOMMENDED: "REJECT",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
  // §7.5: | `carrier` | ✓ | ✓ | ✓ | regenerate | queue |
  // Generated text surrounding the target. Whether ruby renders on an
  // above-stage carrier span is a RenderPlan/§9.6 decision, not a policy cell.
  carrier: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT",
    RUBY_REQUIRED: "ACCEPT",
    REWRITE_RECOMMENDED: "REGENERATE",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
  // §7.5: | `diagnostic_probe` | ✓ | ✓ | ✓ | ✓ | queue |
  // Deliberately inverts the grade gate: the diagnostic exists to locate a
  // student's ceiling, so above-stage content — including spans the classifier
  // would prefer rewritten — is ACCEPTED, not regenerated. Safety (§7.9 L5)
  // and naturalness (§7.9 L4) still apply in full.
  //
  // TODO(spec §19.3, closes end of Week 1): open question — should
  // diagnostic_probe bypass L4 naturalness as well as the grade gate? Current
  // spec (§7.9) says no. Do not change without a coordinator decision.
  diagnostic_probe: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT",
    RUBY_REQUIRED: "ACCEPT",
    REWRITE_RECOMMENDED: "ACCEPT",
    REVIEW_REQUIRED: "QUEUE_REVIEW",
  },
  // §7.5: | `static_chrome` | build-time only ×3 | reject | reject |
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
  // §7.5: | `proper_noun` | **EXEMPT** | — | — | — | — |
  // User-supplied names. EXEMPT — MUST bypass the classifier entirely; these
  // cells should never be reached because a proper_noun span is not classified.
  // Encoded as EXEMPT so a lookup that wrongly happens is still unambiguous.
  proper_noun: {
    PASS: "EXEMPT",
    RUBY_RECOMMENDED: "EXEMPT",
    RUBY_REQUIRED: "EXEMPT",
    REWRITE_RECOMMENDED: "EXEMPT",
    REVIEW_REQUIRED: "EXEMPT",
  },
  // §7.5: | `report_body` | ✓ | ✓ | ✓ | ✓ | ✓ |
  // Parent report prose. Adult reader — every tier is acceptable, including
  // REWRITE_RECOMMENDED and REVIEW_REQUIRED. No regeneration, no queueing.
  //
  // TODO(spec §19.3, closes end of Week 1): whether the answer key shows ruby
  // on revealed answers is an open rendering question about the answer-key
  // document (not a §7.6 suppression change and not a policy cell here).
  // Tracked so the §9.6 rendering work does not silently pick a default.
  report_body: {
    PASS: "ACCEPT",
    RUBY_RECOMMENDED: "ACCEPT",
    RUBY_REQUIRED: "ACCEPT",
    REWRITE_RECOMMENDED: "ACCEPT",
    REVIEW_REQUIRED: "ACCEPT",
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
 * the encoded table changes (which is a breaking change for the classifier and
 * every consumer). Consumers may assert against it to detect drift.
 *
 * 1.0.0 — Week 1 freeze; contained three transcription defects vs §7.5.
 * 1.1.0 — corrected to match the spec table verbatim (diagnostic_probe and
 *         report_body cells); dropped the ACCEPT_WITH_RUBY action per the
 *         v2.3 §7.5 clarification that ✓ = tier acceptability, with ruby
 *         application decided solely by §9.6.
 */
export const SPAN_ROLE_POLICY_VERSION = "1.1.0-week1-frozen";

/** All policy tiers, re-exported for consumers building exhaustive checks. */
export { POLICY_TIERS };
