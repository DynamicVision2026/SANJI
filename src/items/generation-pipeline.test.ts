import test from "node:test";
import assert from "node:assert/strict";

import type { GenerationRequest, LlmProvider } from "@/llm/provider";
import {
  assertDistractorShape,
  generateValidatedItem,
  insertGeneratedItem,
  type ItemDatabase,
  type ItemDatabaseClient,
  type ValidatedGeneratedItem,
} from "./generation-pipeline";

const request: GenerationRequest = {
  grade: 3,
  kanken_level: 8,
  allowed_bare: ["川", "水", "深", "測"],
  allowed_with_ruby: [],
  target_kanji: "測",
  target_reading_ids: [100],
  item_type: "yomi",
  span_role_profile: "target",
  diagnostic_objective: "probe",
  target_hypotheses: ["H1", "H2"],
  contrast_kanji: null,
  topic_hint: "川",
  exclude_item_ids: [],
  cohort_exclude_item_ids: [],
};

const l1: LlmProvider = {
  name: "scripted-l1",
  generate: async () => ({
    text: JSON.stringify({ body_text: "川の水の深さを測る。", answer_text: "はかる", blank_position: 7 }),
    model: "scripted-test-model",
  }),
};
const safety: LlmProvider = { name: "scripted-safety", generate: async () => ({ text: "SAFE", model: "safe-test" }) };

function databaseForGeneration(): ItemDatabase {
  return {
    connect: async () => ({
      query: async <Row = Record<string, unknown>>(sql: string) => {
        if (sql.includes("where id = any")) {
          return { rows: [{ id: 100, kanji: "測", reading_kana: "はかる", reading_type: "kun", school_stage: "elementary" }] as unknown as Row[], rowCount: 1 };
        }
        if (sql.includes("not (id = any")) {
          return { rows: [{ id: 101, kanji: "測", reading_kana: "ソク", reading_type: "on", school_stage: "elementary" }] as unknown as Row[], rowCount: 1 };
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
      release: () => undefined,
    }),
  };
}

test("L1 text passes deterministic L2/L3/L5 and is tagged after safety", async () => {
  const item = await generateValidatedItem({
    database: databaseForGeneration(), provider: l1, safetyProvider: safety, request,
    pii: { kind: "tenantless", attestation: "caller-attests-no-tenant-data-in-scope" },
  });
  assert.equal(item.body_text, "川の水の深さを測る。");
  assert.deepEqual(item.target_reading_ids, [100]);
  assert.deepEqual(item.discriminates, ["H1", "H2"]);
  assert.deepEqual(item.distractors, [{ surface: "ソク", hypothesis: "H2", basis: "reading_table", ref_id: 101 }]);
  assert.deepEqual(item.validation_report, { l2: "passed", l3: "passed", l5: "passed", tagging: "passed" });
});

test("L2 rejects an unapproved generated kanji before persistence", async () => {
  const unsafeL1: LlmProvider = {
    name: "bad-l1",
    generate: async () => ({ text: JSON.stringify({ body_text: "海の水深を測る。", answer_text: "はかる", blank_position: 5 }), model: "bad" }),
  };
  await assert.rejects(
    generateValidatedItem({
      database: databaseForGeneration(), provider: unsafeL1, safetyProvider: safety, request,
      pii: { kind: "tenantless", attestation: "caller-attests-no-tenant-data-in-scope" },
    }),
    /L2 rejected disallowed kanji/,
  );
});

test("curated distractors require a stable ref_id", () => {
  assert.throws(
    () => assertDistractorShape({ surface: "未", hypothesis: "H8", basis: "confusable_pair", ref_id: null }),
    /ref_id is required for curated basis/,
  );
});

function writableItem(distractorStage: "elementary" | "junior_high"): { database: ItemDatabase; calls: string[] } {
  const calls: string[] = [];
  const client: ItemDatabaseClient = {
    query: async <Row = Record<string, unknown>>(sql: string) => {
      calls.push(sql);
      if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [], rowCount: null };
      if (sql.includes("from hypothesis_master")) return { rows: [{ id: "H1" }, { id: "H2" }] as unknown as Row[], rowCount: 2 };
      if (sql.includes("from kanji_reading_stage where id")) {
        return { rows: [{ reading_kana: "ソク", school_stage: distractorStage }] as unknown as Row[], rowCount: 1 };
      }
      if (sql.includes("insert into items")) return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] as unknown as Row[], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
    release: () => undefined,
  };
  return { database: { connect: async () => client }, calls };
}

const item: ValidatedGeneratedItem = {
  body_text: "川の水の深さを測る。", answer_text: "はかる", blank_position: 7,
  target_kanji: "測", target_reading_ids: [100], item_type: "yomi", grade: 3, kanken_level: 8,
  distractors: [{ surface: "ソク", hypothesis: "H2", basis: "reading_table", ref_id: 101 }],
  discriminates: ["H1", "H2"], lexical_surface: null, okurigana_rule_id: null,
  reading_analysis: [{ source_rule_id: 100, tier: "PASS", role: "target" }],
  validation_status: "passed", validation_report: { l2: "passed", l3: "passed", l5: "passed", tagging: "passed" },
  model_used: "scripted-test-model",
};

test("write path rejects an out-of-stage distractor and rolls back", async () => {
  const { database, calls } = writableItem("junior_high");
  await assert.rejects(insertGeneratedItem(database, item), /out-of-stage distractor rejected/);
  assert.ok(calls.includes("rollback"));
  assert.ok(!calls.some((sql) => sql.includes("insert into items")));
});

test("write path inserts all five generation-time item fields with parameterized SQL", async () => {
  const { database, calls } = writableItem("elementary");
  const id = await insertGeneratedItem(database, item);
  assert.equal(id, "11111111-1111-4111-8111-111111111111");
  const insert = calls.find((sql) => sql.includes("insert into items"));
  assert.match(insert!, /target_reading_ids/);
  assert.match(insert!, /distractors/);
  assert.match(insert!, /discriminates/);
  assert.match(insert!, /lexical_surface/);
  assert.match(insert!, /okurigana_rule_id/);
  assert.doesNotMatch(insert!, /川の水の深さ/);
});
