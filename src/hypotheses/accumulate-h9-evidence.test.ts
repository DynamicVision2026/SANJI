import test from "node:test";
import assert from "node:assert/strict";

import { accumulateAndPersistH9Evidence, h9WindowStart } from "./accumulate-h9-evidence";

test("H9 trailing window is inclusive and runtime-sized", () => {
  assert.equal(h9WindowStart("2026-08-19", 60), "2026-06-21");
  assert.equal(h9WindowStart("2024-03-01", 2), "2024-02-29");
});

test("malformed H9 accumulator input fails before database access", async () => {
  let connected = false;
  const database = { connect: async () => { connected = true; throw new Error("must not connect"); } };
  await assert.rejects(
    accumulateAndPersistH9Evidence(database, {
      orgId: "bad",
      branchId: "00000000-0000-4000-8000-000000000002",
      studentId: "00000000-0000-4000-8000-000000000003",
      actorUserId: "00000000-0000-4000-8000-000000000004",
      kanji: "橋",
      readingId: null,
      windowEnd: "2026-08-19",
    }),
    /orgId must be a UUID/,
  );
  assert.equal(connected, false);
});
