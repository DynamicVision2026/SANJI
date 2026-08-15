/**
 * LLM provider abstraction (spec §8.1) — scaffolding.
 *
 * All model calls MUST go through a single internal interface with a swappable
 * provider adapter. Business logic MUST NOT couple to any vendor SDK (§8.1).
 * This module defines that interface and the single outbound choke point that
 * the PII Privacy Gate (§15.2 / §16.2) asserts against.
 *
 * The generation/validation pipeline itself (§7.1–7.10) is Week 3 (§18) and is
 * intentionally NOT implemented here. What exists now:
 *   - the provider interface (so no caller can reach a vendor SDK directly),
 *   - the GenerationRequest contract (§7.3) whose fields carry NO student PII,
 *   - a single `callProvider` choke point with an outbound PII assertion.
 *
 * HARD BOUNDARY (§16.2): no student name, identifier, age, branch, or
 * organisation is ever transmitted to any provider. Only
 * (grade, character sets, reading targets, item type, span role profile,
 * topic hint). Enforced structurally by the request type and asserted here.
 */

import type { SpanRole } from "@/domain/spanRoles";

/**
 * The generation request contract (§7.3). By construction it contains no
 * student identifier, name, age, branch, or organisation. Adding any such field
 * is a §15.2 violation.
 */
export interface GenerationRequest {
  grade: number;
  kanken_level: number;
  /** 既習 set for THIS student — characters usable without ruby. */
  allowed_bare: string[];
  /** Broader permitted set — usable only if RenderPlan assigns ruby. */
  allowed_with_ruby: string[];
  target_kanji: string;
  target_reading_id: number;
  item_type: string;
  span_role_profile: SpanRole;
  /** Neutral, non-identifying topic hint. MUST NOT encode student identity. */
  topic_hint: string;
  exclude_item_ids: string[];
  /** §7.8 cohort diversity. */
  cohort_exclude_item_ids: string[];
}

/**
 * Field-name denylist for the outbound payload scrubber (§15.2 / §16.2). Any of
 * these appearing as a key anywhere in an outbound payload is a hard failure.
 * Sourced from the tenant tables named in §15.2: students, users, branches,
 * organizations.
 */
export const PII_FIELD_DENYLIST: readonly string[] = [
  "display_name",
  "name",
  "student_id",
  "student_name",
  "age",
  "birth_date",
  "enrolled_at",
  "branch_id",
  "branch_name",
  "org_id",
  "organization",
  "organisation",
  "org_name",
  "email",
  "password_hash",
  "address",
  "corporate_number",
];

export interface ProviderResponse {
  text: string;
  model: string;
}

/**
 * The provider adapter interface. Concrete adapters (added in Week 3) implement
 * this; nothing else in the codebase may import a vendor SDK.
 */
export interface LlmProvider {
  readonly name: string;
  generate(prompt: string): Promise<ProviderResponse>;
}

/**
 * Recursively assert that an outbound payload contains no PII-typed keys. This
 * is the assertion half of the §15.2 choke point. It throws (fail loud) rather
 * than scrubbing silently — a silent scrub would let a leak-shaped bug survive.
 */
export function assertNoPiiKeys(payload: unknown, path = "$"): void {
  if (payload === null || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (PII_FIELD_DENYLIST.includes(key)) {
      throw new Error(
        `PII boundary violation (§15.2/§16.2): outbound payload contains forbidden key '${key}' at ${path}. Student PII is never sent to an LLM provider.`,
      );
    }
    assertNoPiiKeys(value, `${path}.${key}`);
  }
}

/**
 * The single outbound choke point. Every model call goes through here so the
 * PII assertion runs exactly once per call, in one auditable place.
 *
 * Week 1: no concrete provider exists yet. Callers passing a provider get the
 * PII assertion enforced; there is deliberately no default vendor wired up.
 */
export async function callProvider(
  provider: LlmProvider,
  request: GenerationRequest,
  prompt: string,
): Promise<ProviderResponse> {
  assertNoPiiKeys(request);
  return provider.generate(prompt);
}
