import { classifyOnKun } from "./h2";
import type { WeightedEvidenceRow } from "./h1";
import type { ResultDatabase } from "../results/record-result";

type SourceKind =
  | "probe_item"
  | "targeted_practice"
  | "manual_with_response"
  | "incidental_item"
  | "home_unsupervised"
  | "manual_without_response";

const SOURCE_FACTORS: Readonly<Record<SourceKind, number>> = {
  probe_item: 1,
  targeted_practice: 0.7,
  manual_with_response: 0.7,
  incidental_item: 0.4,
  home_unsupervised: 0.4,
  manual_without_response: 0.2,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface H2ResultRow extends Record<string, unknown> {
  id: string;
  org_id: string;
  branch_id: string;
  student_id: string;
  grade: number;
  is_correct: boolean | null;
  response_text: string | null;
  observed_at: Date | null;
  source_kind: string | null;
  item_type: string;
  target_kanji: string | null;
  target_reading: string | null;
}

export interface H2EvidenceInput {
  resultId: string;
  itemType: string;
  targetKanji: string | null;
  targetReading: string | null;
  responseText: string | null;
  isCorrect: boolean | null;
  sourceKind: string | null;
  maxStage: "elementary" | "junior_high" | "high_school";
}

export interface PersistH2EvidenceInput {
  orgId: string;
  branchId: string;
  studentId: string;
  resultId: string;
  actorUserId: string;
}

export interface PersistedH2Evidence {
  id: string;
  inserted: boolean;
}

/** Map only a source-backed, opposite on/kun substitution to H2 evidence. */
export function computeH2Evidence(input: H2EvidenceInput): WeightedEvidenceRow | null {
  if (input.isCorrect === true || input.responseText === null || input.sourceKind === null) return null;
  if (input.isCorrect !== false) throw new Error("result correctness must be recorded");
  if (input.itemType !== "yomi") return null;
  if (!input.targetKanji || !input.targetReading) throw new Error("result item is incomplete for H2 evaluation");
  if (!UUID.test(input.resultId)) throw new Error("resultId must be a UUID");
  if (!Object.hasOwn(SOURCE_FACTORS, input.sourceKind)) throw new Error("result source_kind is unsupported");
  if (!input.responseText.trim()) return null;

  const classification = classifyOnKun(
    input.targetKanji,
    input.targetReading,
    input.responseText,
    input.maxStage,
  );
  if (classification.classification !== "H2") return null;
  return {
    kanji: input.targetKanji,
    weight: SOURCE_FACTORS[input.sourceKind as SourceKind],
    evidenceId: `${input.resultId}:H2`,
  };
}

function validateRequest(input: PersistH2EvidenceInput): void {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${name} must be a UUID`);
  }
}

function curriculumStageForGrade(grade: number): "elementary" {
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    throw new Error("student grade cannot be mapped to a curriculum stage");
  }
  return "elementary";
}

export async function persistH2Evidence(
  database: ResultDatabase,
  input: PersistH2EvidenceInput,
): Promise<PersistedH2Evidence | null> {
  validateRequest(input);
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.current_org', $1, true), set_config('app.current_user', $2, true)",
      [input.orgId, input.actorUserId],
    );
    const result = await client.query<H2ResultRow>(
      `select r.id, s.org_id, s.branch_id, r.student_id, s.grade,
              r.is_correct, r.wrong_answer_text as response_text,
              r.graded_at as observed_at, r.source_kind,
              i.item_type, i.target_kanji, target.reading_kana as target_reading
       from results r
       join students s on s.id = r.student_id
       join items i on i.id = r.item_id
       left join kanji_reading_stage target
         on target.id = i.target_reading_id and target.kanji = i.target_kanji
       join users actor on actor.id = $5 and actor.org_id = s.org_id and actor.status = 'active'
       where r.id = $4 and r.student_id = $3
         and s.org_id = $1 and s.branch_id = $2`,
      [input.orgId, input.branchId, input.studentId, input.resultId, input.actorUserId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("result does not identify one tenant-scoped H2 input");
    if (!row.observed_at || !Number.isFinite(new Date(row.observed_at).getTime())) {
      throw new Error("result has no valid observation time");
    }
    const evidence = computeH2Evidence({
      resultId: row.id,
      itemType: row.item_type,
      targetKanji: row.target_kanji,
      targetReading: row.target_reading,
      responseText: row.response_text,
      isCorrect: row.is_correct,
      sourceKind: row.source_kind,
      maxStage: curriculumStageForGrade(row.grade),
    });
    if (!evidence) {
      await client.query("commit");
      return null;
    }

    const inserted = await client.query<{ id: string }>(
      `insert into hypothesis_evidence (
         org_id, branch_id, student_id, hypothesis_id, evidence_key,
         kanji, weight, source_kind, source_record_id, observed_at
       ) values ($1, $2, $3, 'H2', $4, $5, $6, $7, $8, $9)
       on conflict (org_id, evidence_key) do nothing
       returning id`,
      [row.org_id, row.branch_id, row.student_id, evidence.evidenceId, evidence.kanji,
        evidence.weight, row.source_kind, row.id, row.observed_at],
    );
    const existing = inserted.rows[0] ?? (await client.query<{ id: string }>(
      "select id from hypothesis_evidence where org_id = $1 and evidence_key = $2",
      [row.org_id, evidence.evidenceId],
    )).rows[0];
    if (!existing) throw new Error("H2 evidence insert did not produce a durable row");
    await client.query("commit");
    return { id: existing.id, inserted: inserted.rowCount === 1 };
  } catch (error) {
    try { await client.query("rollback"); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
