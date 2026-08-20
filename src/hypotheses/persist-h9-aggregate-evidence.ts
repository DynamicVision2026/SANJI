import { randomUUID } from "node:crypto";

import { getRuntimeConfig } from "../config/runtime";
import type { ResultDatabase } from "../results/record-result";
import { evaluateH9Aggregate } from "./h9";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export interface PersistH9AggregateInput {
  orgId: string;
  branchId: string;
  studentId: string;
  actorUserId: string;
  kanji: string;
  readingId: number | null;
  windowStart: string;
  windowEnd: string;
  recognitionAttempts: number;
  recognitionCorrect: number;
  productionAttempts: number;
  productionCorrect: number;
  minSourceFactor: number;
}

export interface PersistedH9Aggregate {
  observationId: string;
  evidence: { id: string; inserted: boolean } | null;
}

interface AggregateRow extends Record<string, unknown> {
  id: string;
  window_end: string | Date;
  recognition_attempts: number;
  recognition_correct: number;
  production_attempts: number;
  production_correct: number;
  gap: string | number;
  min_source_factor: string | number;
}

type Env = Readonly<Record<string, string | undefined>>;

function parseDate(value: string, name: string): number {
  if (!ISO_DATE.test(value)) throw new Error(`${name} must be an ISO date`);
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid ISO date`);
  }
  return epoch;
}

function validate(input: PersistH9AggregateInput, expectedWindowDays: number): void {
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
  const start = parseDate(input.windowStart, "windowStart");
  const end = parseDate(input.windowEnd, "windowEnd");
  const inclusiveDays = (end - start) / 86_400_000 + 1;
  if (inclusiveDays !== expectedWindowDays) {
    throw new Error(`H9 evaluation window must contain exactly ${expectedWindowDays} days`);
  }
  if (!Number.isFinite(input.minSourceFactor) || input.minSourceFactor <= 0 || input.minSourceFactor > 1) {
    throw new Error("minSourceFactor must be in (0, 1]");
  }
}

function sameObservation(row: AggregateRow, input: PersistH9AggregateInput, gap: number): boolean {
  const storedEnd = row.window_end instanceof Date
    ? row.window_end.toISOString().slice(0, 10)
    : String(row.window_end).slice(0, 10);
  return storedEnd === input.windowEnd
    && row.recognition_attempts === input.recognitionAttempts
    && row.recognition_correct === input.recognitionCorrect
    && row.production_attempts === input.productionAttempts
    && row.production_correct === input.productionCorrect
    && Number(row.gap) === gap
    && Number(row.min_source_factor) === input.minSourceFactor;
}

/**
 * Persist one closed H9 evaluation window, invoked on report generation or on
 * demand after the error-profile accumulator supplies modality totals. It is
 * not a grading-event hook and never reads or writes individual result pairs.
 */
export async function persistH9AggregateEvidence(
  database: ResultDatabase,
  input: PersistH9AggregateInput,
  env: Env = process.env,
): Promise<PersistedH9Aggregate> {
  const config = getRuntimeConfig(env);
  validate(input, config.h9EvaluationWindowDays);
  const evidence = evaluateH9Aggregate(input, {
    minimumObservationsPerSide: config.h9MinimumObservationsPerSide,
    accuracyGapThreshold: config.h9AccuracyGapThreshold,
  });
  const gap = input.recognitionAttempts === 0 || input.productionAttempts === 0
    ? 0
    : input.recognitionCorrect / input.recognitionAttempts
      - input.productionCorrect / input.productionAttempts;
  const kanji = input.kanji.normalize("NFC");
  const key = `H9:${input.studentId}:${kanji}:${input.readingId ?? "none"}:${input.windowStart}`;
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)",
      [input.orgId, input.actorUserId],
    );
    const scope = await client.query(
      `select s.id from students s
       join users actor on actor.id = $4 and actor.org_id = s.org_id and actor.status = 'active'
       where s.id = $3 and s.branch_id = $2 and s.org_id = $1`,
      [input.orgId, input.branchId, input.studentId, input.actorUserId],
    );
    if (!scope.rows[0]) throw new Error("student does not identify one tenant-scoped H9 subject");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);

    let observation = (await client.query<AggregateRow>(
      `select id, window_end, recognition_attempts, recognition_correct,
              production_attempts, production_correct, gap, min_source_factor
       from hypothesis_aggregate_observation
       where student_id = $1 and kanji = $2 and reading_id is not distinct from $3
         and window_start = $4 and hypothesis_id = 'H9'`,
      [input.studentId, kanji, input.readingId, input.windowStart],
    )).rows[0];
    if (observation && !sameObservation(observation, input, gap)) {
      throw new Error("H9 evaluation window was already recorded with different aggregate values");
    }
    if (!observation) {
      observation = (await client.query<AggregateRow>(
        `insert into hypothesis_aggregate_observation (
           id, student_id, org_id, hypothesis_id, kanji, reading_id,
           window_start, window_end, recognition_attempts, recognition_correct,
           production_attempts, production_correct, gap, min_source_factor
         ) values ($1, $2, $3, 'H9', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         returning id, window_end, recognition_attempts, recognition_correct,
                   production_attempts, production_correct, gap, min_source_factor`,
        [
          randomUUID(), input.studentId, input.orgId, kanji, input.readingId,
          input.windowStart, input.windowEnd, input.recognitionAttempts,
          input.recognitionCorrect, input.productionAttempts, input.productionCorrect,
          gap, input.minSourceFactor,
        ],
      )).rows[0];
    }
    if (!observation) throw new Error("H9 aggregate observation was not persisted");

    if (!evidence) {
      await client.query("commit");
      return { observationId: observation.id, evidence: null };
    }
    const inserted = await client.query<{ id: string }>(
      `insert into hypothesis_evidence (
         org_id, branch_id, student_id, hypothesis_id, evidence_key, kanji,
         weight, source_kind, source_record_id, observed_at,
         source_type, aggregate_observation_id
       ) values ($1, $2, $3, 'H9', $4, $5, $6, 'aggregate', null, $7, 'aggregate', $8)
       on conflict (org_id, evidence_key) do nothing
       returning id`,
      [input.orgId, input.branchId, input.studentId, key, kanji, input.minSourceFactor, input.windowEnd, observation.id],
    );
    const stored = inserted.rows[0] ?? (await client.query<{ id: string }>(
      "select id from hypothesis_evidence where org_id = $1 and evidence_key = $2",
      [input.orgId, key],
    )).rows[0];
    if (!stored) throw new Error("H9 evidence insert did not produce a durable row");
    await client.query("commit");
    return { observationId: observation.id, evidence: { id: stored.id, inserted: inserted.rowCount === 1 } };
  } catch (error) {
    try { await client.query("rollback"); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
