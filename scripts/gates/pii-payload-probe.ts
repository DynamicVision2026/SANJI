/**
 * §15.2 PII Privacy Gate — payload probe.
 *
 * Runs IN CI against the real §8.1 choke point (src/llm/provider.ts), not a
 * copy of its logic. It constructs fixture tenant rows (students / users /
 * branches / organizations), builds outbound payloads through the actual
 * serialisation path, and asserts:
 *
 *   1. a clean payload passes AND its serialised form contains no fixture
 *      tenant value (inspecting the bytes as transmitted, per v2.3 §15.2);
 *   2. a student name smuggled into the free-text prompt is rejected;
 *   3. a branch name smuggled into topic_hint is rejected;
 *   4. a PII-named key added to the request is rejected (structural scan);
 *   5. a nested PII-named key is rejected.
 *
 * Any "must reject" case that passes exits non-zero and fails the build.
 * Invoked by scripts/gates/pii-privacy.mjs via tsx.
 */

import {
  assertOutboundPayloadClean,
  callProvider,
  serializeOutboundPayload,
  type GenerationRequest,
  type LlmProvider,
  type PiiContext,
} from "../../src/llm/provider";

// ---------------------------------------------------------------------------
// Fixture tenant data — synthetic; the values a real session would source from
// students / users / branches / organizations rows (§15.2).
// ---------------------------------------------------------------------------
const FIXTURE_STUDENT_NAME = "山田花子";
const FIXTURE_USER_EMAIL = "instructor@example-juku.jp";
const FIXTURE_BRANCH_NAME = "駅前第二教室";
const FIXTURE_ORG_NAME = "髙木ゼミナール";

const piiContext: PiiContext = {
  forbiddenValues: [
    FIXTURE_STUDENT_NAME,
    FIXTURE_USER_EMAIL,
    FIXTURE_BRANCH_NAME,
    FIXTURE_ORG_NAME,
  ],
};

const fakeProvider: LlmProvider = {
  name: "gate-probe-fake",
  generate: async () => ({ text: "", model: "none" }),
};

function cleanRequest(): GenerationRequest {
  return {
    grade: 3,
    kanken_level: 8,
    allowed_bare: ["山", "川", "花"],
    allowed_with_ruby: ["宮", "業"],
    target_kanji: "宮",
    target_reading_id: 42,
    item_type: "yomi",
    span_role_profile: "carrier",
    topic_hint: "どうぶつえん",
    exclude_item_ids: [],
    cohort_exclude_item_ids: [],
  };
}

const CLEAN_PROMPT =
  "小学3年生向けに、宮 を含む自然な短文を1つ作成してください。トピック: どうぶつえん";

let failures = 0;

function fail(name: string, detail: string): void {
  failures += 1;
  console.error(`  ✗ ${name}: ${detail}`);
}

function pass(name: string): void {
  console.log(`  ✓ ${name}`);
}

async function mustPass(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    pass(name);
  } catch (error) {
    fail(name, `clean payload was rejected: ${(error as Error).message}`);
  }
}

async function mustReject(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    fail(name, "payload containing tenant PII was NOT rejected by the choke point");
  } catch {
    pass(name);
  }
}

// 1. Clean payload passes, and the serialised bytes contain no fixture value.
await mustPass("clean payload passes the choke point", async () => {
  await callProvider(fakeProvider, cleanRequest(), CLEAN_PROMPT, piiContext);
});

{
  const serialized = serializeOutboundPayload(cleanRequest(), CLEAN_PROMPT);
  const leaked = piiContext.forbiddenValues.filter((v) => serialized.includes(v));
  if (leaked.length > 0) {
    fail(
      "serialised clean payload contains no tenant value",
      `fixture value(s) present in serialised payload: ${leaked.length}`,
    );
  } else {
    pass("serialised clean payload contains no tenant value");
  }
}

// 2. Student name smuggled into the free-text prompt → reject.
await mustReject("student name in prompt is rejected", async () => {
  const prompt = `${FIXTURE_STUDENT_NAME}さんのために、宮 を含む短文を作成してください。`;
  await callProvider(fakeProvider, cleanRequest(), prompt, piiContext);
});

// 3. Branch name smuggled into topic_hint → reject.
await mustReject("branch name in topic_hint is rejected", async () => {
  const request = { ...cleanRequest(), topic_hint: FIXTURE_BRANCH_NAME };
  await callProvider(fakeProvider, request, CLEAN_PROMPT, piiContext);
});

// 4. PII-named key on the request → reject (structural scan).
await mustReject("PII-named key on request is rejected", async () => {
  const request = { ...cleanRequest(), display_name: FIXTURE_STUDENT_NAME } as GenerationRequest;
  assertOutboundPayloadClean(request, CLEAN_PROMPT, piiContext);
});

// 5. Nested PII-named key → reject.
await mustReject("nested PII-named key is rejected", async () => {
  const request = {
    ...cleanRequest(),
    metadata: { contact: { email: FIXTURE_USER_EMAIL } },
  } as unknown as GenerationRequest;
  assertOutboundPayloadClean(request, CLEAN_PROMPT, piiContext);
});

// 6. Org name (異体字 included) in prompt → reject.
await mustReject("organization name in prompt is rejected", async () => {
  const prompt = `${FIXTURE_ORG_NAME}の生徒向けの短文を作成してください。`;
  await callProvider(fakeProvider, cleanRequest(), prompt, piiContext);
});

if (failures > 0) {
  console.error(`\npii-payload-probe: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("pii-payload-probe: all choke-point assertions hold");
