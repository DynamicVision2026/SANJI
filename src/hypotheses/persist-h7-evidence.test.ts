import test from "node:test";
import assert from "node:assert/strict";

import { computeH7Evidence, persistH7Evidence, type H7EvidenceInput } from "./persist-h7-evidence";

const resultId = "00000000-0000-4000-8000-000000000007";
const base = (overrides: Partial<H7EvidenceInput> = {}): H7EvidenceInput => ({
  resultId,
  itemType: "yomi",
  targetKanji: "今",
  lexicalSurface: "今日",
  responseText: "いまひ",
  isCorrect: false,
  sourceKind: "probe_item",
  ...overrides,
});

test("closed-set compositional reading produces one H7 evidence shape", () => {
  assert.deepEqual(computeH7Evidence(base()), { kanji: "今", weight: 1, evidenceId: `${resultId}:H7` });
  assert.equal(computeH7Evidence(base({ sourceKind: "targeted_practice" }))?.weight, 0.7);
});

test("unknown response and valid reading variant do not become H7 evidence", () => {
  assert.equal(computeH7Evidence(base({ responseText: "でたらめ" })), null);
  assert.equal(computeH7Evidence(base({ targetKanji: "明", lexicalSurface: "明日", responseText: "あした" })), null);
});

test("NULL response and NULL or unsupported source independently skip H7 evidence", () => {
  assert.equal(computeH7Evidence(base({ responseText: null })), null);
  assert.equal(computeH7Evidence(base({ sourceKind: null })), null);
  assert.equal(computeH7Evidence(base({ sourceKind: "invented_source" })), null);
});

test("non-yomi results do not become H7 evidence", () => {
  assert.equal(computeH7Evidence(base({ itemType: "kakitori" })), null);
});

test("malformed H7 persistence request fails before database access", async () => {
  let connected = false;
  await assert.rejects(
    persistH7Evidence(
      { connect: async () => { connected = true; throw new Error("must not connect"); } },
      { orgId: "bad", branchId: resultId, studentId: resultId, resultId, actorUserId: resultId },
    ),
    /orgId must be a UUID/,
  );
  assert.equal(connected, false);
});
