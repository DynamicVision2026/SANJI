import test from "node:test";
import assert from "node:assert/strict";

import provenance from "../../sources_provenance.json";
import data from "./data/tsukuru_disambiguation.json";
import { disambiguateTsukuru } from "./disambiguation";

const cases = [
  ["新しい規則をつくる。", "作"],
  ["画期的な商品をつくる。", "創"],
  ["大きな船をつくる。", "造"],
] as const;

test("all three つくる kanji resolve from source-backed context", () => {
  for (const [context, expected] of cases) {
    const result = disambiguateTsukuru(context);
    assert.equal(result.target_kanji, expected);
    assert.equal(result.certainty, "CONFIDENT");
  }
});

test("ambiguous つくる context is REVIEW_REQUIRED", () => {
  assert.equal(disambiguateTsukuru("作品をつくる。").certainty, "REVIEW_REQUIRED");
});

test("つくる provenance is complete and frozen by its named human reviewer", () => {
  const source = provenance.sources.find((entry) => entry.dataset.startsWith("tsukuru_disambiguation"));
  assert.ok(source);
  assert.equal(source.file_hash.value, data.source_sha256);
  assert.equal(data.verification_status, "frozen");
  assert.equal(data.verified_by, "Brian Fu");
  assert.equal(data.verified_at, "2026-08-17");
  for (const rule of data.rules) assert.ok(rule.source_page > 0);
});

test("つくる regression output is byte-identical across repeated runs", () => {
  const run = () => JSON.stringify(cases.map(([context]) => disambiguateTsukuru(context)));
  const expected = run();
  for (let i = 0; i < 100; i += 1) assert.equal(run(), expected);
});
