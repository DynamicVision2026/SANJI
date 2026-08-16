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
 * is the structural half of the §15.2 assertion. It throws (fail loud) rather
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
 * The complete outbound payload as it would be transmitted to a provider —
 * the structured request AND the free-text prompt. §15.2 (v2.3) requires the
 * assertion to run over this serialised form, not over intermediate objects:
 * a key-only check on `request` would let a caller smuggle a student name
 * directly into the prompt string.
 */
export interface OutboundPayload {
  prompt: string;
  request: GenerationRequest;
}

/**
 * Serialise the outbound payload exactly as it would be transmitted. This is
 * the artefact the §15.2 assertions (runtime and gate) inspect. Any future
 * transport change (extra fields, different wire shape) MUST go through this
 * function so the assertion and the transmission can never diverge.
 */
export function serializeOutboundPayload(request: GenerationRequest, prompt: string): string {
  const payload: OutboundPayload = { prompt, request };
  return JSON.stringify(payload);
}

/**
 * Values sourced from tenant rows (`students`, `users`, `branches`,
 * `organizations`) that must never appear in an outbound payload — names,
 * display names, emails, addresses, identifiers. The generation pipeline
 * (Week 3, §7) is responsible for populating this from the rows in the
 * session's scope before calling the provider.
 */
export interface PiiContext {
  forbiddenValues: readonly string[];
}

/**
 * Minimum trimmed length for a forbidden value to participate in the
 * substring scan. Rationale: a single-character value (e.g. a one-kanji
 * display_name) matched as a substring would flag essentially every Japanese
 * sentence, making generation unusable rather than safe.
 *
 * ⚠ Scoped decision, raised per §0.1 rather than silently chosen: §15.2 says
 * "no value traceable to students/users/branches/organizations appears" and
 * does not carve out short values. This constant is the practical floor and is
 * flagged in the PR for coordinator confirmation. Callers may pass a stricter
 * minLength (1) via assertNoForbiddenValues if that is decided.
 */
export const MIN_FORBIDDEN_VALUE_LENGTH = 2;

/**
 * Assert that none of the forbidden tenant-derived values appears anywhere in
 * the serialised outbound payload — prompt text included. Throws on the first
 * hit (fail loud; §15.2).
 */
export function assertNoForbiddenValues(
  serialized: string,
  forbiddenValues: readonly string[],
  minLength: number = MIN_FORBIDDEN_VALUE_LENGTH,
): void {
  for (const raw of forbiddenValues) {
    const value = raw?.trim();
    if (!value || value.length < minLength) continue;
    if (serialized.includes(value)) {
      throw new Error(
        `PII boundary violation (§15.2/§16.2): a tenant-derived value appears in the serialised outbound payload (length ${value.length}). ` +
          `Student PII is never sent to an LLM provider. The value is not echoed here to avoid propagating it into logs.`,
      );
    }
  }
}

/**
 * Run the full §15.2 assertion set over the payload exactly as it would be
 * transmitted: structural key scan over request AND prompt container, then a
 * value scan over the serialised form. Returns the serialised payload so the
 * transmitted bytes are, by construction, the inspected bytes.
 */
export function assertOutboundPayloadClean(
  request: GenerationRequest,
  prompt: string,
  pii?: PiiContext,
): string {
  const serialized = serializeOutboundPayload(request, prompt);
  assertNoPiiKeys({ prompt, request } satisfies OutboundPayload);
  assertNoForbiddenValues(serialized, pii?.forbiddenValues ?? []);
  return serialized;
}

/**
 * The single outbound choke point (§8.1). Every model call goes through here
 * so the §15.2 assertions run exactly once per call, in one auditable place,
 * over the serialised payload as transmitted — prompt included.
 *
 * `pii.forbiddenValues` MUST be supplied by any caller operating in a tenant
 * context (the Week 3 pipeline populates it from the session's tenant rows).
 * Week 1: no concrete provider exists yet; there is deliberately no default
 * vendor wired up.
 */
export async function callProvider(
  provider: LlmProvider,
  request: GenerationRequest,
  prompt: string,
  pii?: PiiContext,
): Promise<ProviderResponse> {
  assertOutboundPayloadClean(request, prompt, pii);
  return provider.generate(prompt);
}
