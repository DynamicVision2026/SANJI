import test from "node:test";
import assert from "node:assert/strict";

import { computeH2Evidence, persistH2Evidence, type H2EvidenceInput } from "./persist-h2-evidence";

const resultId = "00000000-0000-4000-8000-000000000002";
const base = (overrides: Partial<H2EvidenceInput> = {}): H2EvidenceInput => ({
  resultId,
  itemType: "yomi",
  targetKanji: "宮",
  targetReading: "みや",
  responseText: "キュウ",
  isCorrect: false,
  sourceKind: "probe_item",
  maxStage: "elementary",
  ...overrides,
});

test("opposite source-backed on/kun reading produces H2 evidence", () => {
  assert.deepEqual(computeH2Evidence(base()), { kanji: "宮", weight: 1, evidenceId: `${resultId}:H2` });
  assert.equal(computeH2Evidence(base({ sourceKind: "targeted_practice" }))?.weight, 0.7);
});

test("H1-like unknown response and same-type reading do not become H2", () => {
  assert.equal(computeH2Evidence(base({ responseText: "むぐ" })), null);
  assert.equal(computeH2Evidence(base({ targetReading: "キュウ", responseText: "グウ", maxStage: "junior_high" })), null);
});

test("NULL response and NULL source independently skip H2 evidence", () => {
  assert.equal(computeH2Evidence(base({ responseText: null })), null);
  assert.equal(computeH2Evidence(base({ sourceKind: null })), null);
});

test("malformed H2 persistence request fails before database access", async () => {
  let connected = false;
  await assert.rejects(
    persistH2Evidence(
      { connect: async () => { connected = true; throw new Error("must not connect"); } },
      { orgId: "bad", branchId: resultId, studentId: resultId, resultId, actorUserId: resultId },
    ),
    /orgId must be a UUID/,
  );
  assert.equal(connected, false);
});
