import { getRuntimeConfig } from "../config/runtime";
import type { ResultDatabase } from "../results/record-result";
import {
  persistH9AggregateEvidence,
  type PersistedH9Aggregate,
  type PersistH9AggregateInput,
} from "./persist-h9-aggregate-evidence";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

type Env = Readonly<Record<string, string | undefined>>;

export interface AccumulateH9EvidenceInput {
  orgId: string;
  branchId: string;
  studentId: string;
  actorUserId: string;
  kanji: string;
  readingId: number | null;
  windowEnd: string;
}

interface AggregateCounts extends Record<string, unknown> {
  recognition_attempts: number;
  recognition_correct: number;
  production_attempts: number;
  production_correct: number;
  min_source_factor: number | null;
}

function validate(input: AccumulateH9EvidenceInput): void {
  for (const [name, value] of Object.entries({
    orgId: input.orgId,
    branchId: input.branchId,
    studentId: input.studentId,
    actorUserId: input.actorUserId,
  })) {
    if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${name} must be a UUID`);
  }
  if (Array.from(input.kanji.normalize("NFC")).length !== 1) throw new Error("kanji must be one character");
  if (input.readingId !== null && (!Number.isInteger(input.readingId) || input.readingId <= 0)) {
    throw new Error("readingId must be null or a positive integer");
  }
  if (!ISO_DATE.test(input.windowEnd)) throw new Error("windowEnd must be an ISO date");
  const epoch = Date.parse(`${input.windowEnd}T00:00:00.000Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== input.windowEnd) {
    throw new Error("windowEnd must be a valid ISO date");
  }
}

export function h9WindowStart(windowEnd: string, days: number): string {
  const end = Date.parse(`${windowEnd}T00:00:00.000Z`);
  return new Date(end - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * On-demand/report-triggered H9 evaluation over persisted result events.
 * Results without a supported source_kind are excluded because their
 * §11.4.1 factor is unknown; they must not be assigned a guessed weight.
 */
export async function accumulateAndPersistH9Evidence(
  database: ResultDatabase,
  input: AccumulateH9EvidenceInput,
  env: Env = process.env,
): Promise<PersistedH9Aggregate | null> {
  validate(input);
  const config = getRuntimeConfig(env);
  const windowStart = h9WindowStart(input.windowEnd, config.h9EvaluationWindowDays);
  const client = await database.connect();
  let counts: AggregateCounts;
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)",
      [input.orgId, input.actorUserId],
    );
    const scope = await client.query(
      `select s.id from students s
       join users actor on actor.id = $4 and actor.org_id = s.org_id and actor.status = 'active'
       where s.org_id = $1 and s.branch_id = $2 and s.id = $3`,
      [input.orgId, input.branchId, input.studentId, input.actorUserId],
    );
    if (!scope.rows[0]) throw new Error("student does not identify one tenant-scoped H9 subject");

    counts = (await client.query<AggregateCounts>(
      `select
         count(*) filter (where i.item_type = 'yomi')::int as recognition_attempts,
         count(*) filter (where i.item_type = 'yomi' and r.is_correct)::int as recognition_correct,
         count(*) filter (where i.item_type = 'kakitori')::int as production_attempts,
         count(*) filter (where i.item_type = 'kakitori' and r.is_correct)::int as production_correct,
         min(case r.source_kind
           when 'probe_item' then 1.0
           when 'targeted_practice' then 0.7
           when 'manual_with_response' then 0.7
           when 'incidental_item' then 0.4
           when 'home_unsupervised' then 0.4
           when 'manual_without_response' then 0.2
         end)::float8 as min_source_factor
       from results r
       join students s on s.id = r.student_id
       join items i on i.id = r.item_id
       where s.org_id = $1 and s.branch_id = $2 and s.id = $3
         and i.target_kanji = $4
         and i.target_reading_id is not distinct from $5
         and i.item_type in ('yomi', 'kakitori')
         and r.is_correct is not null
         and r.source_kind in (
           'probe_item', 'targeted_practice', 'manual_with_response',
           'incidental_item', 'home_unsupervised', 'manual_without_response'
         )
         and r.graded_at >= $6::date
         and r.graded_at < ($7::date + interval '1 day')`,
      [
        input.orgId,
        input.branchId,
        input.studentId,
        input.kanji.normalize("NFC"),
        input.readingId,
        windowStart,
        input.windowEnd,
      ],
    )).rows[0]!;
    await client.query("commit");
  } catch (error) {
    try { await client.query("rollback"); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    client.release();
  }

  if (counts.min_source_factor === null) return null;
  const aggregate: PersistH9AggregateInput = {
    ...input,
    kanji: input.kanji.normalize("NFC"),
    windowStart,
    recognitionAttempts: counts.recognition_attempts,
    recognitionCorrect: counts.recognition_correct,
    productionAttempts: counts.production_attempts,
    productionCorrect: counts.production_correct,
    minSourceFactor: counts.min_source_factor,
  };
  return persistH9AggregateEvidence(database, aggregate, env);
}
