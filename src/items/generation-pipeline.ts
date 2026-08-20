import okuriganaData from "@/curriculum/data/okurigana_pilot.json";
import type { ReadingType, SchoolStage } from "@/curriculum/schema";
import { classifyH7 } from "@/hypotheses/h7";
import {
  callProvider,
  type GenerationRequest,
  type LlmProvider,
  type PiiContext,
} from "@/llm/provider";

const DISTRACTOR_BASES = [
  "reading_table",
  "homophone_set",
  "dokun_set",
  "confusable_pair",
  "phonological_rule",
  "okurigana_rule",
] as const;
const CURATED_BASES = new Set<DistractorBasis>(["homophone_set", "dokun_set", "confusable_pair"]);
const SAFE_TEXT = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}0-9、。「」！？々ー\s]+$/u;
const BLOCKED_CONTENT = ["死", "殺", "けが", "病気", "円", "恋愛", "ブランド"] as const;
const stageRank: Record<SchoolStage, number> = { elementary: 0, junior_high: 1, high_school: 2 };

export type DistractorBasis = (typeof DISTRACTOR_BASES)[number];

export interface ItemDistractor {
  surface: string;
  hypothesis: string;
  basis: DistractorBasis;
  ref_id: number | string | null;
}

interface L1Output {
  body_text: string;
  answer_text: string;
  blank_position: number;
}

export interface ValidatedGeneratedItem extends L1Output {
  target_kanji: string;
  target_reading_ids: number[];
  item_type: string;
  grade: number;
  kanken_level: number;
  distractors: ItemDistractor[];
  discriminates: string[];
  lexical_surface: string | null;
  okurigana_rule_id: string | null;
  reading_analysis: { source_rule_id: number; tier: "PASS"; role: "target" }[];
  validation_status: "passed";
  validation_report: { l2: "passed"; l3: "passed"; l5: "passed"; tagging: "passed" };
  model_used: string;
}

export interface ItemDatabaseClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
}

export interface ItemDatabase {
  connect(): Promise<ItemDatabaseClient>;
}

export interface GenerateItemOptions {
  database: ItemDatabase;
  provider: LlmProvider;
  safetyProvider: LlmProvider;
  request: GenerationRequest;
  pii: PiiContext;
  lexicalSurface?: string | null;
  okuriganaRuleId?: string | null;
}

function normalize(value: string): string {
  return value.normalize("NFC");
}

function parseL1(text: string): L1Output {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("L1 provider response must be JSON");
  }
  if (!value || typeof value !== "object") throw new Error("L1 provider response must be an object");
  const row = value as Record<string, unknown>;
  if (typeof row.body_text !== "string" || !row.body_text.trim()) throw new Error("body_text is required");
  if (typeof row.answer_text !== "string" || !row.answer_text.trim()) throw new Error("answer_text is required");
  if (!Number.isInteger(row.blank_position) || (row.blank_position as number) < 0) {
    throw new Error("blank_position must be a non-negative integer");
  }
  return {
    body_text: normalize(row.body_text),
    answer_text: normalize(row.answer_text),
    blank_position: row.blank_position as number,
  };
}

interface ReadingRow {
  id: number;
  kanji: string;
  reading_kana: string;
  reading_type: ReadingType;
  school_stage: SchoolStage;
}

function validateRequestShape(request: GenerationRequest): void {
  if (!Number.isInteger(request.grade) || request.grade < 1 || request.grade > 6) {
    throw new Error("grade must be an elementary grade from 1 through 6");
  }
  if (!Array.isArray(request.target_reading_ids) || request.target_reading_ids.length === 0) {
    throw new Error("target_reading_ids must contain at least one reading ID");
  }
  const uniqueIds = [...new Set(request.target_reading_ids)];
  if (uniqueIds.length !== request.target_reading_ids.length || !uniqueIds.every(Number.isInteger)) {
    throw new Error("target_reading_ids must be unique integers");
  }
}

async function loadTargetReadings(database: ItemDatabase, request: GenerationRequest): Promise<ReadingRow[]> {
  const client = await database.connect();
  try {
    const result = await client.query<ReadingRow>(
      `select id, kanji, reading_kana, reading_type, school_stage
         from kanji_reading_stage
        where id = any($1::bigint[])`,
      [request.target_reading_ids],
    );
    const byId = new Map(result.rows.map((row) => [Number(row.id), { ...row, id: Number(row.id) }]));
    const targets = request.target_reading_ids.map((id) => byId.get(id));
    if (targets.some((row) => !row || row.kanji !== request.target_kanji)) {
      throw new Error("every target reading must exist and belong to target_kanji");
    }
    if (targets.some((row) => stageRank[row!.school_stage] > stageRank.elementary)) {
      throw new Error("target reading is above the requested elementary student stage");
    }
    return targets as ReadingRow[];
  } finally {
    client.release();
  }
}

function validateL2(text: string, request: GenerationRequest): void {
  if (!SAFE_TEXT.test(text)) throw new Error("L2 rejected a character outside the permitted Japanese set");
  const allowedBare = new Set(request.allowed_bare.map(normalize));
  const allowedWithRuby = new Set(request.allowed_with_ruby.map(normalize));
  for (const char of text) {
    if (!/\p{Script=Han}/u.test(char)) continue;
    if (allowedBare.has(char)) continue;
    if (allowedWithRuby.has(char)) {
      throw new Error("L2 requires ruby for a carrier character; this minimal slice cannot persist it bare");
    }
    throw new Error(`L2 rejected disallowed kanji U+${char.codePointAt(0)!.toString(16).toUpperCase()}`);
  }
}

async function deriveTags(
  database: ItemDatabase,
  request: GenerationRequest,
  targets: ReadingRow[],
  lexicalSurface: string | null,
  okuriganaRuleId: string | null,
): Promise<{ distractors: ItemDistractor[]; discriminates: string[] }> {
  const tags = new Set<string>();
  const distractors: ItemDistractor[] = [];
  if (request.target_hypotheses.includes("H1") && request.item_type === "yomi") tags.add("H1");
  if (request.target_hypotheses.includes("H2") && request.item_type === "yomi") {
    const targetTypes = new Set(targets.map((row) => row.reading_type));
    const client = await database.connect();
    try {
      const alternatives = await client.query<ReadingRow>(
        `select id, kanji, reading_kana, reading_type, school_stage
           from kanji_reading_stage
          where kanji = $1 and not (id = any($2::bigint[])) and school_stage = 'elementary'`,
        [request.target_kanji, request.target_reading_ids],
      );
      for (const raw of alternatives.rows) {
        const row = { ...raw, id: Number(raw.id) };
        if (!targetTypes.has(row.reading_type)) {
        distractors.push({ surface: normalize(row.reading_kana), hypothesis: "H2", basis: "reading_table", ref_id: row.id });
        }
      }
    } finally {
      client.release();
    }
    if (distractors.length > 0) tags.add("H2");
  }
  if (okuriganaRuleId) tags.add("H6");
  if (lexicalSurface) tags.add("H7");
  if (["yomi", "kakitori"].includes(request.item_type) && request.target_hypotheses.includes("H9")) tags.add("H9");
  return { distractors, discriminates: [...tags].sort() };
}

export function assertDistractorShape(distractor: ItemDistractor): void {
  if (!distractor || typeof distractor !== "object") throw new Error("distractor must be an object");
  if (typeof distractor.surface !== "string" || !distractor.surface.trim()) throw new Error("distractor.surface is required");
  if (typeof distractor.hypothesis !== "string" || !distractor.hypothesis.trim()) {
    throw new Error("distractor.hypothesis is required");
  }
  if (!(DISTRACTOR_BASES as readonly string[]).includes(distractor.basis)) throw new Error("distractor.basis is unsupported");
  if (CURATED_BASES.has(distractor.basis) && distractor.ref_id == null) {
    throw new Error(`distractor.ref_id is required for curated basis ${distractor.basis}`);
  }
  if (distractor.ref_id != null && !(typeof distractor.ref_id === "string" || Number.isInteger(distractor.ref_id))) {
    throw new Error("distractor.ref_id must be a stable string or integer identifier");
  }
}

/** L1 generates text only; L2/L3/L5 and §7A tags are deterministic. */
export async function generateValidatedItem(options: GenerateItemOptions): Promise<ValidatedGeneratedItem> {
  validateRequestShape(options.request);
  const targets = await loadTargetReadings(options.database, options.request);
  const prompt = [
    "Return JSON only with body_text, answer_text, blank_position.",
    `Create one natural Japanese ${options.request.item_type} item for grade ${options.request.grade}.`,
    `Use target ${options.request.target_kanji} exactly once and answer with reading ${targets[0]!.reading_kana}.`,
    "Do not classify hypotheses and do not add distractors.",
  ].join("\n");
  const generated = await callProvider(options.provider, options.request, prompt, options.pii);
  const l1 = parseL1(generated.text);
  validateL2(l1.body_text, options.request);
  if ([...l1.body_text].filter((char) => char === options.request.target_kanji).length !== 1) {
    throw new Error("L3 requires target_kanji to occur exactly once");
  }
  if ([...l1.body_text].findIndex((char) => char === options.request.target_kanji) !== l1.blank_position) {
    throw new Error("blank_position must identify the target occurrence");
  }
  if (options.request.item_type === "yomi" && normalize(l1.answer_text) !== normalize(targets[0]!.reading_kana)) {
    throw new Error("L3 answer does not match the target reading");
  }
  if (BLOCKED_CONTENT.some((term) => l1.body_text.includes(term))) throw new Error("L5 blocklist rejected generated text");

  const safety = await callProvider(
    options.safetyProvider,
    options.request,
    `Return exactly SAFE or REJECT for child safety. Text: ${l1.body_text}`,
    options.pii,
  );
  if (safety.text.trim() !== "SAFE") throw new Error("L5 safety classifier did not return SAFE");

  const lexicalSurface = options.lexicalSurface ? normalize(options.lexicalSurface) : null;
  const okuriganaRuleId = options.okuriganaRuleId ?? null;
  if (okuriganaRuleId && !okuriganaData.rules.some((rule) => rule.id === okuriganaRuleId)) {
    throw new Error("unknown okurigana_rule_id");
  }
  if (okuriganaRuleId && okuriganaData.verification_status !== "frozen") {
    throw new Error("okurigana rules are unavailable until named-human review freezes the asset");
  }
  if (lexicalSurface && classifyH7(lexicalSurface, l1.answer_text).classification !== "CORRECT") {
    throw new Error("lexical_surface and answer_text do not resolve to an admitted H7 reading");
  }
  const tags = await deriveTags(options.database, options.request, targets, lexicalSurface, okuriganaRuleId);
  return {
    ...l1,
    target_kanji: options.request.target_kanji,
    target_reading_ids: [...options.request.target_reading_ids],
    item_type: options.request.item_type,
    grade: options.request.grade,
    kanken_level: options.request.kanken_level,
    ...tags,
    lexical_surface: lexicalSurface,
    okurigana_rule_id: okuriganaRuleId,
    reading_analysis: targets.map((row) => ({ source_rule_id: row.id, tier: "PASS", role: "target" })),
    validation_status: "passed",
    validation_report: { l2: "passed", l3: "passed", l5: "passed", tagging: "passed" },
    model_used: generated.model,
  };
}

function validateItemForWrite(item: ValidatedGeneratedItem): void {
  if (item.validation_status !== "passed") throw new Error("only passed items may be persisted");
  if (!Array.isArray(item.distractors) || !Array.isArray(item.discriminates)) throw new Error("diagnostic tags must be arrays");
  item.distractors.forEach(assertDistractorShape);
}

/** Parameterized, transactional global-corpus insertion with fail-closed tag checks. */
export async function insertGeneratedItem(database: ItemDatabase, item: ValidatedGeneratedItem): Promise<string> {
  validateItemForWrite(item);
  const client = await database.connect();
  try {
    await client.query("begin");
    const hypothesisIds = [...new Set([
      ...item.discriminates,
      ...item.distractors.map((distractor) => distractor.hypothesis),
    ])];
    const known = await client.query<{ id: string }>(
      "select id from hypothesis_master where id = any($1::text[])",
      [hypothesisIds],
    );
    if (known.rows.length !== hypothesisIds.length) throw new Error("item references an unknown hypothesis identifier");

    for (const distractor of item.distractors) {
      if (distractor.basis !== "reading_table") {
        throw new Error(`distractor basis ${distractor.basis} has no admitted queryable asset in this slice`);
      }
      const source = await client.query<{ reading_kana: string; school_stage: SchoolStage }>(
        "select reading_kana, school_stage from kanji_reading_stage where id = $1",
        [distractor.ref_id],
      );
      const row = source.rows[0];
      if (!row || normalize(row.reading_kana) !== normalize(distractor.surface)) {
        throw new Error("reading-table distractor does not match its provenance row");
      }
      if (stageRank[row.school_stage] > stageRank.elementary) {
        throw new Error("out-of-stage distractor rejected by L3");
      }
    }

    const inserted = await client.query<{ id: string }>(
      `insert into items (
         item_type, target_kanji, target_reading_ids, body_text, answer_text,
         blank_position, grade, kanken_level, reading_analysis,
         validation_status, validation_report, source, model_used,
         distractors, discriminates, lexical_surface, okurigana_rule_id
       ) values (
         $1, $2, $3::bigint[], $4, $5, $6, $7, $8, $9::jsonb,
         $10, $11::jsonb, 'generated', $12,
         $13::jsonb, $14::text[], $15, $16
       ) returning id`,
      [
        item.item_type, item.target_kanji, item.target_reading_ids, item.body_text,
        item.answer_text, item.blank_position, item.grade, item.kanken_level,
        JSON.stringify(item.reading_analysis), item.validation_status,
        JSON.stringify(item.validation_report), item.model_used,
        JSON.stringify(item.distractors), item.discriminates,
        item.lexical_surface, item.okurigana_rule_id,
      ],
    );
    await client.query("commit");
    return inserted.rows[0]!.id;
  } catch (error) {
    try { await client.query("rollback"); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
