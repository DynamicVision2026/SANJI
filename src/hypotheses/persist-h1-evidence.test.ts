import test from "node:test";
import assert from "node:assert/strict";

import { computeH1Evidence, persistH1Evidence, type H1EvidenceInput } from "./persist-h1-evidence";

const resultId = "00000000-0000-4000-8000-000000000001";
const base = (overrides: Partial<H1EvidenceInput> = {}): H1EvidenceInput => ({
  resultId,
  itemType: "yomi",
  targetKanji: "宮",
  targetAnswer: "みや",
  responseText: "グウ",
  isCorrect: false,
  sourceKind: "probe_item",
  inStageReadings: [],
  ...overrides,
});

test("H2 exclusion uses the coarse stage query and does not treat an empty lookup as a match", () => {
  assert.equal(computeH1Evidence(base({ inStageReadings: ["グウ"] })), null);
  assert.deepEqual(computeH1Evidence(base()), { kanji: "宮", weight: 1, evidenceId: `${resultId}:H1` });
  assert.deepEqual(computeH1Evidence(base({ responseText: "むぐ" })), {
    kanji: "宮",
    weight: 1,
    evidenceId: `${resultId}:H1`,
  });
});

test("H1 weighting is yomi 1.0 and kakitori 0.5 before the source factor", () => {
  assert.equal(computeH1Evidence(base())?.weight, 1);
  assert.equal(computeH1Evidence(base({ itemType: "kakitori", responseText: "官" }))?.weight, 0.5);
  assert.equal(computeH1Evidence(base({ sourceKind: "incidental_item" }))?.weight, 0.4);
});

test("uncaptured response and unknown provenance independently produce no evidence row", () => {
  assert.equal(computeH1Evidence(base({ responseText: null })), null);
  assert.equal(computeH1Evidence(base({ sourceKind: null })), null);
});

test.skip("H8-consistent responses await the §6.7 admitted confusable-pairs table (Issue #18 Update 2)", () => {
  // The committed H8 snapshot is PENDING_HUMAN_PRUNING and must not become production authority.
});

test("malformed persistence input fails before acquiring a database connection", async () => {
  let connected = false;
  await assert.rejects(
    persistH1Evidence(
      { connect: async () => { connected = true; throw new Error("must not connect"); } },
      { orgId: "bad", branchId: resultId, studentId: resultId, resultId, actorUserId: resultId },
    ),
    /orgId must be a UUID/,
  );
  assert.equal(connected, false);
});
