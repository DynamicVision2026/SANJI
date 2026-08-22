import test from "node:test";
import assert from "node:assert/strict";

import { createDiagnosticRun, type CreateDiagnosticRunInput } from "./create-diagnostic-run";
import type { ResultDatabaseClient } from "../results/record-result";

const ids = {
  orgId: "00000000-0000-4000-8000-000000000001",
  branchId: "00000000-0000-4000-8000-000000000002",
  studentId: "00000000-0000-4000-8000-000000000003",
  actorUserId: "00000000-0000-4000-8000-000000000004",
} satisfies CreateDiagnosticRunInput;

test("malformed run input fails before acquiring a database connection", async () => {
  let connected = false;
  await assert.rejects(
    createDiagnosticRun(
      { connect: async () => { connected = true; throw new Error("must not connect"); } },
      { ...ids, orgId: "bad" },
    ),
    /orgId must be a UUID/,
  );
  assert.equal(connected, false);
});

test("service parameterizes tenant context and run creation", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  let released = false;
  const client: ResultDatabaseClient = {
    async query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values });
      return { rows: text.startsWith("select create_diagnostic_run") ? [{ id: ids.studentId } as unknown as Row] : [], rowCount: 1 };
    },
    release() { released = true; },
  };
  assert.deepEqual(await createDiagnosticRun({ connect: async () => client }, ids), { id: ids.studentId });
  assert.deepEqual(calls[1]?.values, [ids.orgId, ids.actorUserId]);
  assert.deepEqual(calls[2]?.values, [ids.orgId, ids.branchId, ids.studentId, ids.actorUserId]);
  assert.equal(calls.at(-1)?.text, "commit");
  assert.equal(released, true);
});

test("database failure rolls back and releases the client", async () => {
  const calls: string[] = [];
  let released = false;
  const client: ResultDatabaseClient = {
    async query<Row extends Record<string, unknown>>(text: string) {
      calls.push(text);
      if (text.startsWith("select create_diagnostic_run")) throw new Error("denied");
      return { rows: [] as Row[], rowCount: 0 };
    },
    release() { released = true; },
  };
  await assert.rejects(createDiagnosticRun({ connect: async () => client }, ids), /denied/);
  assert.equal(calls.at(-1), "rollback");
  assert.equal(released, true);
});
