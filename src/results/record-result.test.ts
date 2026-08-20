import test from "node:test";
import assert from "node:assert/strict";

import { recordResult, type ResultDatabase } from "./record-result";

test("malformed result input fails before acquiring a database connection", async () => {
  let connected = false;
  const database: ResultDatabase = {
    async connect() {
      connected = true;
      throw new Error("must not connect");
    },
  };

  await assert.rejects(
    recordResult(database, {
      orgId: "not-a-uuid",
      branchId: "not-a-uuid",
      studentId: "not-a-uuid",
      worksheetId: "not-a-uuid",
      itemId: "not-a-uuid",
      gradedByUserId: "not-a-uuid",
      isCorrect: false,
      wrongAnswerText: null,
      gradedAt: new Date(),
    }),
    /orgId must be a UUID/,
  );
  assert.equal(connected, false);
});

test("unsupported sourceKind fails before acquiring a database connection", async () => {
  let connected = false;
  const database: ResultDatabase = {
    async connect() {
      connected = true;
      throw new Error("must not connect");
    },
  };

  await assert.rejects(
    recordResult(database, {
      orgId: "00000000-0000-4000-8000-000000000001",
      branchId: "00000000-0000-4000-8000-000000000002",
      studentId: "00000000-0000-4000-8000-000000000003",
      worksheetId: "00000000-0000-4000-8000-000000000004",
      itemId: "00000000-0000-4000-8000-000000000005",
      gradedByUserId: "00000000-0000-4000-8000-000000000006",
      isCorrect: false,
      wrongAnswerText: null,
      gradedAt: new Date(),
      sourceKind: "invented" as never,
    }),
    /sourceKind is unsupported/,
  );
  assert.equal(connected, false);
});
