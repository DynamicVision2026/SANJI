import test from "node:test";
import assert from "node:assert/strict";

import provenance from "../../sources_provenance.json";
import data from "./data/aku_akeru_disambiguation.json";
import { disambiguateAkuAkeru, type AkuAkeruReading } from "./disambiguation";

const cases = [
  ["夜があける。", "あける", "明"],
  ["席があく。", "あく", "空"],
  ["窓をあける。", "あける", "開"],
] as const;

test("all three あく/あける kanji resolve across both verb forms", () => {
  for (const [context, reading, expected] of cases) {
    const result = disambiguateAkuAkeru(context, reading);
    assert.equal(result.target_kanji, expected);
    assert.equal(result.reading_kana, reading);
    assert.equal(result.certainty, "CONFIDENT");
  }
});

test("shared rules work for each strict intransitive/transitive reading", () => {
  assert.equal(disambiguateAkuAkeru("時間があく。", "あく").target_kanji, "空");
  assert.equal(disambiguateAkuAkeru("時間をあける。", "あける").target_kanji, "空");
  assert.equal(disambiguateAkuAkeru("ドアがあく。", "あく").target_kanji, "開");
  assert.equal(disambiguateAkuAkeru("ドアをあける。", "あける").target_kanji, "開");
});

test("ambiguous あく/あける context is REVIEW_REQUIRED", () => {
  assert.equal(disambiguateAkuAkeru("予定があく。", "あく").certainty, "REVIEW_REQUIRED");
});

test("invalid reading fails loudly at runtime", () => {
  assert.throws(() => disambiguateAkuAkeru("窓をひらく。", "ひらく" as AkuAkeruReading));
});

test("あく/あける provenance is complete and independently pending human review", () => {
  const source = provenance.sources.find((entry) => entry.dataset.startsWith("aku_akeru_disambiguation"));
  assert.ok(source);
  assert.equal(source.file_hash.value, data.source_sha256);
  assert.equal(data.verification_status, "PENDING_HUMAN_REVIEW");
  assert.equal(data.verified_by, null);
  assert.equal(data.verified_at, null);
  for (const rule of data.rules) {
    assert.deepEqual(rule.reading_kana, ["あく", "あける"]);
    assert.ok(rule.source_page > 0);
  }
});

test("あく/あける regression output is byte-identical across repeated runs", () => {
  const run = () => JSON.stringify(cases.map(([context, reading]) => disambiguateAkuAkeru(context, reading)));
  const expected = run();
  for (let i = 0; i < 100; i += 1) assert.equal(run(), expected);
});
