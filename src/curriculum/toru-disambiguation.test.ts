import test from "node:test";
import assert from "node:assert/strict";

import provenance from "../../sources_provenance.json";
import data from "./data/toru_disambiguation.json";
import { disambiguateToru } from "./disambiguation";

const cases = [
  ["連絡をとる。", "取"],
  ["指紋をとる。", "採"],
  ["指揮をとる。", "執"],
  ["外野フライをとる。", "捕"],
  ["写真をとる。", "撮"],
] as const;

test("all five とる kanji resolve from source-backed context", () => {
  for (const [context, expected] of cases) {
    const result = disambiguateToru(context);
    assert.equal(result.target_kanji, expected);
    assert.equal(result.certainty, "CONFIDENT");
  }
});

test("ambiguous とる context is REVIEW_REQUIRED", () => {
  assert.equal(disambiguateToru("記録をとる。").certainty, "REVIEW_REQUIRED");
});

test("single-kanji terms do not match inside longer kanji compounds", () => {
  assert.equal(disambiguateToru("学年をとる。").certainty, "REVIEW_REQUIRED");
});

test("NFC and NFD context produce identical results", () => {
  const context = "ビデオカメラでとる。";
  assert.deepEqual(disambiguateToru(context.normalize("NFC")), disambiguateToru(context.normalize("NFD")));
});

test("unreviewed rule tables are unavailable at runtime", () => {
  const originalStatus = data.verification_status;
  try {
    data.verification_status = "PENDING_HUMAN_REVIEW";
    assert.equal(disambiguateToru("写真をとる。").certainty, "REVIEW_REQUIRED");
  } finally {
    data.verification_status = originalStatus;
  }
});

test("魚 alone is REVIEW_REQUIRED, never resolved by rule ordering", () => {
  const result = disambiguateToru("魚をとる。");
  assert.equal(result.certainty, "REVIEW_REQUIRED");
  assert.equal(result.target_kanji, null);
  assert.equal(result.source_rule_id, null);
});

test("とる provenance is complete and frozen by its named human reviewer", () => {
  const source = provenance.sources.find((entry) => entry.dataset.startsWith("toru_disambiguation"));
  assert.ok(source);
  assert.equal(data.rules.length, 5);
  assert.equal(source.file_hash.value, data.source_sha256);
  assert.equal(data.verification_status, "frozen");
  assert.equal(data.verified_by, "Brian Fu");
  assert.equal(data.verified_at, "2026-08-17");
  for (const rule of data.rules) assert.ok(rule.source_page > 0);
});

test("とる regression output is byte-identical across repeated runs", () => {
  const run = () => JSON.stringify(cases.map(([context]) => disambiguateToru(context)));
  const expected = run();
  for (let i = 0; i < 100; i += 1) assert.equal(run(), expected);
});
