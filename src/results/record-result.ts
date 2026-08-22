import { resolveResponseText } from "./response-text";

export interface ResultDatabaseClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
}

export interface ResultDatabase {
  connect(): Promise<ResultDatabaseClient>;
}

export interface RecordResultInput {
  orgId: string;
  branchId: string;
  studentId: string;
  worksheetId: string;
  itemId: string;
  gradedByUserId: string;
  isCorrect: boolean;
  wrongAnswerText: string | null;
  /** Undefined preserves the legacy wrongAnswerText-derived behavior. */
  responseText?: string | null;
  gradedAt: Date;
  /**
   * Optional by design: NULL means provenance is unknown, so downstream
   * evidence adapters skip rather than invent a source weight. Existing rows
   * from before migration 0011 are also legitimately NULL.
   */
  sourceKind?: ResultSourceKind;
}

export interface RecordedResult {
  id: string;
  inserted: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RESULT_SOURCE_KINDS = [
  "probe_item",
  "targeted_practice",
  "manual_with_response",
  "incidental_item",
  "home_unsupervised",
  "manual_without_response",
  "aggregate",
] as const;
export type ResultSourceKind = (typeof RESULT_SOURCE_KINDS)[number];

function validate(input: RecordResultInput): void {
  for (const [name, value] of Object.entries({
    orgId: input.orgId,
    branchId: input.branchId,
    studentId: input.studentId,
    worksheetId: input.worksheetId,
    itemId: input.itemId,
    gradedByUserId: input.gradedByUserId,
  })) {
    if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${name} must be a UUID`);
  }
  if (typeof input.isCorrect !== "boolean") throw new Error("isCorrect must be boolean");
  if (input.wrongAnswerText !== null && typeof input.wrongAnswerText !== "string") {
    throw new Error("wrongAnswerText must be null or a non-empty string");
  }
  if (!(input.gradedAt instanceof Date) || !Number.isFinite(input.gradedAt.getTime())) {
    throw new Error("gradedAt must be a valid Date");
  }
  if (input.sourceKind !== undefined && !(RESULT_SOURCE_KINDS as readonly unknown[]).includes(input.sourceKind)) {
    throw new Error("sourceKind is unsupported");
  }
}

/**
 * Persist one caller-graded result. Identical concurrent calls are idempotent
 * on (worksheet, item, student): a transaction-scoped advisory lock serializes
 * the check/insert because the existing results schema has no unique key for
 * that logical event. This protects this service path without changing schema.
 */
export async function recordResult(database: ResultDatabase, input: RecordResultInput): Promise<RecordedResult> {
  validate(input);
  const response = resolveResponseText(input);
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)",
      [input.orgId, input.gradedByUserId],
    );
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${input.worksheetId}:${input.itemId}:${input.studentId}`,
    ]);

    const existing = await client.query<{ id: string }>(
      "select id from results where worksheet_id = $1 and item_id = $2 and student_id = $3",
      [input.worksheetId, input.itemId, input.studentId],
    );
    if (existing.rows[0]) {
      await client.query("commit");
      return { id: existing.rows[0].id, inserted: false };
    }

    const inserted = await client.query<{ id: string }>(
      `insert into results (
         worksheet_id, item_id, student_id, is_correct,
         wrong_answer_text, response_text, graded_at, graded_by_user_id, source_kind
       )
       select $4, $5, s.id, $6, $7, $8, $9, $10, $11
       from students s
       join worksheets w
         on w.id = $4 and w.student_id = s.id
        and w.org_id = s.org_id and w.branch_id = s.branch_id
       join worksheet_items wi on wi.worksheet_id = w.id and wi.item_id = $5
       join users grader on grader.id = $10 and grader.org_id = s.org_id and grader.status = 'active'
       where s.org_id = $1 and s.branch_id = $2 and s.id = $3
       returning id`,
      [
        input.orgId,
        input.branchId,
        input.studentId,
        input.worksheetId,
        input.itemId,
        input.isCorrect,
        response.wrongAnswerText,
        response.responseText,
        input.gradedAt,
        input.gradedByUserId,
        input.sourceKind ?? null,
      ],
    );
    if (!inserted.rows[0]) throw new Error("result context does not identify one tenant-scoped worksheet item");
    await client.query("commit");
    return { id: inserted.rows[0].id, inserted: true };
  } catch (error) {
    try { await client.query("rollback"); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
