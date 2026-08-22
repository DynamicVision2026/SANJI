import type { ResultDatabase } from "../results/record-result";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface CreateDiagnosticRunInput {
  orgId: string;
  branchId: string;
  studentId: string;
  actorUserId: string;
}

export interface CreatedDiagnosticRun {
  id: string;
}

function validate(input: CreateDiagnosticRunInput): void {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${name} must be a UUID`);
  }
}

/**
 * Authorize and create one diagnostic-run boundary. Calls are intentionally
 * non-idempotent: the current contract has no stable caller event key, so each
 * successful invocation represents a new, auditable run.
 */
export async function createDiagnosticRun(
  database: ResultDatabase,
  input: CreateDiagnosticRunInput,
): Promise<CreatedDiagnosticRun> {
  validate(input);
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)",
      [input.orgId, input.actorUserId],
    );
    const created = await client.query<{ id: string }>(
      "select create_diagnostic_run($1, $2, $3, $4) as id",
      [input.orgId, input.branchId, input.studentId, input.actorUserId],
    );
    if (!created.rows[0]) throw new Error("diagnostic run was not created");
    await client.query("commit");
    return created.rows[0];
  } catch (error) {
    try { await client.query("rollback"); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
