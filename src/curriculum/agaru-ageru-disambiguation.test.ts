import test from "node:test";
import assert from "node:assert/strict";

import provenance from "../../sources_provenance.json";
import data from "./data/agaru_ageru_disambiguation.json";
import { disambiguateAgaruAgeru, type AgaruAgeruReading } from "./disambiguation";

const cases = [
  ["地位があがる。", "あがる", "上"],
  ["国旗をあげる。", "あげる", "揚"],
  ["例をあげる。", "あげる", "挙"],
] as const;

test("all three あがる/あげる kanji resolve across both verb forms", () => {
  for (const [context, reading, expected] of cases) {
    const result = disambiguateAgaruAgeru(context, reading);
    assert.equal(result.target_kanji, expected);
    assert.equal(result.reading_kana, reading);
    assert.equal(result.certainty, "CONFIDENT");
  }
});

test("shared rules work for each strict intransitive/transitive reading", () => {
  assert.equal(disambiguateAgaruAgeru("料金があがる。", "あがる").target_kanji, "上");
  assert.equal(disambiguateAgaruAgeru("腕前をあげる。", "あげる").target_kanji, "上");
  assert.equal(disambiguateAgaruAgeru("国旗があがる。", "あがる").target_kanji, "揚");
  assert.equal(disambiguateAgaruAgeru("国旗をあげる。", "あげる").target_kanji, "揚");
});

test("officially perspective-dependent 花火 case is REVIEW_REQUIRED", () => {
  assert.equal(disambiguateAgaruAgeru("花火があがる。", "あがる").certainty, "REVIEW_REQUIRED");
});

test("invalid reading fails loudly at runtime", () => {
  assert.throws(() => disambiguateAgaruAgeru("地位がのぼる。", "のぼる" as AgaruAgeruReading));
});

test("あがる/あげる provenance is complete and independently pending human review", () => {
  const source = provenance.sources.find((entry) => entry.dataset.startsWith("agaru_ageru_disambiguation"));
  assert.ok(source);
  assert.equal(source.file_hash.value, data.source_sha256);
  assert.equal(data.verification_status, "PENDING_HUMAN_REVIEW");
  assert.equal(data.verified_by, null);
  assert.equal(data.verified_at, null);
  for (const rule of data.rules) {
    assert.deepEqual(rule.reading_kana, ["あがる", "あげる"]);
    assert.ok(rule.source_page > 0);
  }
});

test("あがる/あげる regression output is byte-identical across repeated runs", () => {
  const run = () => JSON.stringify(cases.map(([context, reading]) => disambiguateAgaruAgeru(context, reading)));
  const expected = run();
  for (let i = 0; i < 100; i += 1) assert.equal(run(), expected);
});
