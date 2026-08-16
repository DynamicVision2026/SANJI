import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_FORBIDDEN_VALUE_LENGTH,
  assertNoForbiddenValues,
  assertNoPiiKeys,
  assertOutboundPayloadClean,
  callProvider,
  serializeOutboundPayload,
  type GenerationRequest,
  type LlmProvider,
  type PiiContext,
} from "./provider";

const fakeProvider: LlmProvider = {
  name: "test-fake",
  generate: async () => ({ text: "", model: "none" }),
};

function cleanRequest(): GenerationRequest {
  return {
    grade: 2,
    kanken_level: 9,
    allowed_bare: ["山", "川"],
    allowed_with_ruby: ["宮"],
    target_kanji: "宮",
    target_reading_id: 7,
    item_type: "yomi",
    span_role_profile: "carrier",
    topic_hint: "こうえん",
    exclude_item_ids: [],
    cohort_exclude_item_ids: [],
  };
}

const TENANT: PiiContext = {
  kind: "tenant_scoped",
  forbiddenValues: ["山田花子", "駅前第二教室", "owner@example-juku.jp"],
};

const TENANTLESS: PiiContext = {
  kind: "tenantless",
  attestation: "caller-attests-no-tenant-data-in-scope",
};

// ---------------------------------------------------------------------------
// Issue #6 blocking issue 1 — the round-1 gap was that PiiContext was optional:
// callProvider(provider, request, prompt) compiled, skipped the value scan, and
// reached provider.generate(). These tests make that regression impossible to
// reintroduce silently.
// ---------------------------------------------------------------------------

test("omitting PiiContext is a COMPILE-TIME error (issue #6 blocking issue 1)", () => {
  // If `pii` ever becomes optional (or gains a default) again, the
  // ts-expect-error directives below become "unused" and `npm run typecheck`
  // fails the build. This is the test that would have caught the round-1 gap:
  // it exercises the exact call shape a careless future caller would write.

  // @ts-expect-error — callProvider without a PiiContext must not compile
  const badCall = () => callProvider(fakeProvider, cleanRequest(), "山田花子向けの短文。");

  // @ts-expect-error — assertOutboundPayloadClean without a PiiContext must not compile
  const badAssert = () => assertOutboundPayloadClean(cleanRequest(), "山田花子向けの短文。");

  // The arrows are never invoked — their existence is the type-level assertion.
  assert.equal(typeof badCall, "function");
  assert.equal(typeof badAssert, "function");
});

test("tenant_scoped with an EMPTY value list throws — unloaded tenant data is not tenantless", async () => {
  await assert.rejects(
    callProvider(fakeProvider, cleanRequest(), "短文を作成してください。", {
      kind: "tenant_scoped",
      forbiddenValues: [],
    }),
    /empty forbiddenValues/,
  );
});

test("tenantless calls require the explicit literal attestation and still get the key scan", async () => {
  const response = await callProvider(
    fakeProvider,
    cleanRequest(),
    "短文を作成してください。",
    TENANTLESS,
  );
  assert.equal(response.model, "none");

  // Structural key scan still applies in full to tenantless calls.
  const bad = { ...cleanRequest(), display_name: "x" } as GenerationRequest;
  assert.throws(() => assertOutboundPayloadClean(bad, "p", TENANTLESS), /forbidden key/);
});

// ---------------------------------------------------------------------------
// Round-1 behaviour, retained.
// ---------------------------------------------------------------------------

test("clean tenant-scoped payload passes the choke point (§15.2)", async () => {
  const response = await callProvider(
    fakeProvider,
    cleanRequest(),
    "短文を作成してください。",
    TENANT,
  );
  assert.equal(response.model, "none");
});

test("serialised payload includes the prompt — the inspected bytes are the transmitted bytes", () => {
  const serialized = serializeOutboundPayload(cleanRequest(), "PROMPT_MARKER_XYZ");
  assert.ok(serialized.includes("PROMPT_MARKER_XYZ"));
  assert.ok(serialized.includes("こうえん"));
});

test("tenant value in the free-text prompt is rejected (§15.2 prompt bypass fix)", async () => {
  await assert.rejects(
    callProvider(fakeProvider, cleanRequest(), "山田花子さん向けの短文。", TENANT),
    /PII boundary violation/,
  );
});

test("tenant value in topic_hint is rejected via the serialised scan", async () => {
  const request = { ...cleanRequest(), topic_hint: "駅前第二教室" };
  await assert.rejects(
    callProvider(fakeProvider, request, "短文を作成してください。", TENANT),
    /PII boundary violation/,
  );
});

test("PII-named key anywhere in the payload is rejected (structural scan)", () => {
  const request = { ...cleanRequest(), display_name: "x" } as GenerationRequest;
  assert.throws(() => assertOutboundPayloadClean(request, "p", TENANT), /forbidden key 'display_name'/);

  const nested = {
    ...cleanRequest(),
    meta: { branch_name: "y" },
  } as unknown as GenerationRequest;
  assert.throws(() => assertOutboundPayloadClean(nested, "p", TENANT), /forbidden key 'branch_name'/);
});

test("assertNoPiiKeys walks arrays and nested objects", () => {
  assert.throws(
    () => assertNoPiiKeys({ list: [{ ok: 1 }, { email: "e" }] }),
    /forbidden key 'email'/,
  );
  assert.doesNotThrow(() => assertNoPiiKeys({ list: [{ ok: 1 }], deep: { fine: "yes" } }));
});

test("value scan floor: 2-char default, stricter override available (OPEN coordinator item, issue #6 item 4)", () => {
  assert.equal(MIN_FORBIDDEN_VALUE_LENGTH, 2);
  assert.doesNotThrow(() => assertNoForbiddenValues('{"t":"山です"}', ["山"]));
  assert.throws(
    () => assertNoForbiddenValues('{"t":"山です"}', ["山"], 1),
    /PII boundary violation/,
  );
});

test("error message does not echo the leaked value (no log propagation)", () => {
  try {
    assertNoForbiddenValues('{"p":"山田花子"}', ["山田花子"]);
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(!(error as Error).message.includes("山田花子"));
  }
});
