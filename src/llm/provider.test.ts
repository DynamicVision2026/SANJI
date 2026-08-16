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

const FORBIDDEN = ["山田花子", "駅前第二教室", "owner@example-juku.jp"];

test("clean payload passes the choke point (§15.2)", async () => {
  const response = await callProvider(fakeProvider, cleanRequest(), "短文を作成してください。", {
    forbiddenValues: FORBIDDEN,
  });
  assert.equal(response.model, "none");
});

test("serialised payload includes the prompt — the inspected bytes are the transmitted bytes", () => {
  const serialized = serializeOutboundPayload(cleanRequest(), "PROMPT_MARKER_XYZ");
  assert.ok(serialized.includes("PROMPT_MARKER_XYZ"));
  assert.ok(serialized.includes("こうえん")); // request fields present too
});

test("tenant value in the free-text prompt is rejected (§15.2 prompt bypass fix)", async () => {
  await assert.rejects(
    callProvider(fakeProvider, cleanRequest(), "山田花子さん向けの短文。", {
      forbiddenValues: FORBIDDEN,
    }),
    /PII boundary violation/,
  );
});

test("tenant value in topic_hint is rejected via the serialised scan", async () => {
  const request = { ...cleanRequest(), topic_hint: "駅前第二教室" };
  await assert.rejects(
    callProvider(fakeProvider, request, "短文を作成してください。", { forbiddenValues: FORBIDDEN }),
    /PII boundary violation/,
  );
});

test("PII-named key anywhere in the payload is rejected (structural scan)", () => {
  const request = { ...cleanRequest(), display_name: "x" } as GenerationRequest;
  assert.throws(() => assertOutboundPayloadClean(request, "p"), /forbidden key 'display_name'/);

  const nested = {
    ...cleanRequest(),
    meta: { branch_name: "y" },
  } as unknown as GenerationRequest;
  assert.throws(() => assertOutboundPayloadClean(nested, "p"), /forbidden key 'branch_name'/);
});

test("assertNoPiiKeys walks arrays and nested objects", () => {
  assert.throws(
    () => assertNoPiiKeys({ list: [{ ok: 1 }, { email: "e" }] }),
    /forbidden key 'email'/,
  );
  assert.doesNotThrow(() => assertNoPiiKeys({ list: [{ ok: 1 }], deep: { fine: "yes" } }));
});

test("value scan honours the minimum-length floor and its override", () => {
  // Below the documented floor: not scanned by default (see §0.1 flag on
  // MIN_FORBIDDEN_VALUE_LENGTH), scanned when a stricter floor is passed.
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
