/**
 * L3 reading-analysis tiers (spec §7.4).
 *
 * The tier enum and the §7.5 span-role policy table are FROZEN at end of Week 1
 * (§18) and form the contract between the L3 classifier (§7.4) and every
 * consumer (§7.5 policy, §7.6 RenderPlan, §7.8 corpus key). Downstream work
 * depends on these identifiers being stable — treat this module as versioned.
 *
 * Ordered lowest → highest risk, exactly as the §7.4 table lists them.
 */
export const TIERS = [
  "PASS",
  "RUBY_RECOMMENDED",
  "RUBY_REQUIRED",
  "REWRITE_RECOMMENDED",
  "REVIEW_REQUIRED",
  "EXEMPT",
] as const;

export type Tier = (typeof TIERS)[number];

/**
 * The five tiers that participate in the §7.5 action-policy table. `EXEMPT` is
 * excluded because an EXEMPT span never enters the classifier (see §7.5
 * `proper_noun`) — it is a classifier-scope marker, not a policy input.
 */
export const POLICY_TIERS = [
  "PASS",
  "RUBY_RECOMMENDED",
  "RUBY_REQUIRED",
  "REWRITE_RECOMMENDED",
  "REVIEW_REQUIRED",
] as const;

export type PolicyTier = (typeof POLICY_TIERS)[number];

/** The classification `basis` recorded per span (§7.4 analysis record). */
export const READING_BASES = [
  "lexical",
  "character",
  "reading",
  "heuristic",
] as const;

export type ReadingBasis = (typeof READING_BASES)[number];

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}
