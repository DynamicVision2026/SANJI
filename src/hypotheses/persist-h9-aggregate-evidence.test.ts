import test from "node:test";
import assert from "node:assert/strict";

import { persistH9AggregateEvidence, type PersistH9AggregateInput } from "./persist-h9-aggregate-evidence";

const id = "00000000-0000-4000-8000-000000000001";
const valid: PersistH9AggregateInput = {
  orgId: id,
  branchId: id,
  studentId: id,
  actorUserId: id,
  kanji: "橋",
  readingId: null,
  windowStart: "2026-06-21",
  windowEnd: "2026-08-19",
  recognitionAttempts: 5,
  recognitionCorrect: 5,
  productionAttempts: 5,
  productionCorrect: 2,
  minSourceFactor: 0.4,
};

test("malformed H9 persistence input fails before a database connection", async () => {
  let connected = false;
  const database = { connect: async () => { connected = true; throw new Error("must not connect"); } };
  await assert.rejects(persistH9AggregateEvidence(database, { ...valid, kanji: "橋川" }, { APP_ENV: "development" }), /one character/);
  assert.equal(connected, false);
});

test("H9 persistence enforces the configured trailing-window length", async () => {
  const database = { connect: async () => { throw new Error("must not connect"); } };
  await assert.rejects(
    persistH9AggregateEvidence(database, { ...valid, windowStart: "2026-07-01" }, { APP_ENV: "development" }),
    /exactly 60 days/,
  );
});
