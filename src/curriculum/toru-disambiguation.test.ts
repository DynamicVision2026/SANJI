import test from "node:test";
import assert from "node:assert/strict";

import provenance from "../../sources_provenance.json";
import data from "./data/toru_disambiguation.json";
import { disambiguateToru } from "./disambiguation";

const cases = [
  ["連絡をとる。", "取"],
  ["指紋をとる。", "採"],
  ["指揮をとる。", "執"],
  ["写真をとる。", "撮"],
] as const;

test("all four とる kanji resolve from source-backed context", () => {
  for (const [context, expected] of cases) {
    const result = disambiguateToru(context);
    assert.equal(result.target_kanji, expected);
    assert.equal(result.certainty, "CONFIDENT");
  }
});

test("ambiguous とる context is REVIEW_REQUIRED", () => {
  assert.equal(disambiguateToru("記録をとる。").certainty, "REVIEW_REQUIRED");
});

test("とる provenance is complete and independently pending human review", () => {
  const source = provenance.sources.find((entry) => entry.dataset.startsWith("toru_disambiguation"));
  assert.ok(source);
  assert.equal(source.file_hash.value, data.source_sha256);
  assert.equal(data.verification_status, "PENDING_HUMAN_REVIEW");
  assert.equal(data.verified_by, null);
  assert.equal(data.verified_at, null);
  for (const rule of data.rules) assert.ok(rule.source_page > 0);
});

test("とる regression output is byte-identical across repeated runs", () => {
  const run = () => JSON.stringify(cases.map(([context]) => disambiguateToru(context)));
  const expected = run();
  for (let i = 0; i < 100; i += 1) assert.equal(run(), expected);
});
