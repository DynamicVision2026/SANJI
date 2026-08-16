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
 * PII context for an outbound call — REQUIRED on every call (§15.2; issue #6
 * blocking issue 1). This is a discriminated union so the unsafe state is
 * unrepresentable, not merely unlikely:
 *
 *  - `tenant_scoped`: the call happens in a tenant context. `forbiddenValues`
 *    carries the values sourced from the session's `students` / `users` /
 *    `branches` / `organizations` rows (names, display names, emails,
 *    addresses, identifiers). An EMPTY list here throws at runtime — a
 *    tenant-scoped call always has at least a display_name in scope, so an
 *    empty list means the caller failed to load tenant data, not that there
 *    is none.
 *  - `tenantless`: the caller explicitly attests there is no tenant data in
 *    scope (e.g. build-time static_chrome validation). The attestation is a
 *    fixed literal so it cannot be produced by passing along some empty
 *    variable — writing it is a deliberate act, visible in review.
 *
 * There is deliberately NO default and NO optional form: omitting the context
 * is a compile-time error, enforced by an @ts-expect-error test in
 * provider.test.ts that breaks the typecheck if this parameter ever becomes
 * optional again.
 */
export type PiiContext =
  | { kind: "tenant_scoped"; forbiddenValues: readonly string[] }
  | { kind: "tenantless"; attestation: "caller-attests-no-tenant-data-in-scope" };

/**
 * Minimum trimmed length for a forbidden value to participate in the
 * substring scan. Rationale: a single-character value (e.g. a one-kanji
 * display_name) matched as a substring would flag essentially every Japanese
 * sentence, making generation unusable rather than safe.
 *
 * COORDINATOR-APPROVED (issue #6 item 4): The floor remains at 2 characters.
 * This value is confirmed and not subject to change without explicit
 * re-approval. Single-kanji display_names are currently NOT caught by the
 * substring scan — this is the approved trade-off between PII detection
 * precision and generation usability.
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
 *
 * `pii` is REQUIRED (issue #6 blocking issue 1): there is no call shape in
 * which the prompt reaches a provider unscanned. A `tenant_scoped` context
 * with an empty value list throws — that is a caller that failed to load its
 * tenant data, not a tenantless call (which must attest explicitly).
 */
export function assertOutboundPayloadClean(
  request: GenerationRequest,
  prompt: string,
  pii: PiiContext,
): string {
  const serialized = serializeOutboundPayload(request, prompt);
  assertNoPiiKeys({ prompt, request } satisfies OutboundPayload);
  if (pii.kind === "tenant_scoped") {
    if (pii.forbiddenValues.length === 0) {
      throw new Error(
        "PII boundary misuse (§15.2): tenant_scoped context with an empty forbiddenValues list. " +
          "A tenant-scoped call always has at least the student display_name in scope; an empty list means tenant data was not loaded. " +
          "If this call genuinely has no tenant data, use { kind: 'tenantless', attestation: 'caller-attests-no-tenant-data-in-scope' } explicitly.",
      );
    }
    assertNoForbiddenValues(serialized, pii.forbiddenValues);
  }
  // kind === "tenantless": the caller has explicitly attested no tenant data
  // exists in scope. The structural key scan above still applies in full.
  return serialized;
}

/**
 * The single outbound choke point (§8.1). Every model call goes through here
 * so the §15.2 assertions run exactly once per call, in one auditable place,
 * over the serialised payload as transmitted — prompt included.
 *
 * `pii` is REQUIRED with no default (issue #6 blocking issue 1) — omitting it
 * is a compile-time error, so no code path can reach `provider.generate()`
 * without the prompt having been scanned. The Week 3 pipeline populates
 * `tenant_scoped` contexts from the session's tenant rows; genuinely
 * tenantless calls must attest that explicitly.
 */
export async function callProvider(
  provider: LlmProvider,
  request: GenerationRequest,
  prompt: string,
  pii: PiiContext,
): Promise<ProviderResponse> {
  assertOutboundPayloadClean(request, prompt, pii);
  return provider.generate(prompt);
}
