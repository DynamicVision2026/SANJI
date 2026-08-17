import test from "node:test";
import assert from "node:assert/strict";

import provenance from "../../sources_provenance.json";
import rules from "./data/hakaru_disambiguation.json";
import { disambiguateHakaru, getHakaruRuleTableStatus } from "./disambiguation";

const cases = [
  ["会社は合理化をはかる。", "図", "合理化"],
  ["走った時間をはかる。", "計", "時間"],
  ["川までの距離をはかる。", "測", "距離"],
  ["荷物の重さをはかる。", "量", "重さ"],
] as const;

test("all four はかる kanji resolve from source-backed context", () => {
  for (const [context, expected, matchedContext] of cases) {
    assert.deepEqual(disambiguateHakaru(context), {
      reading_kana: "はかる",
      target_kanji: expected,
      certainty: "CONFIDENT",
      source_rule_id: rules.rules.find((rule) => rule.target_kanji === expected)!.id,
      matched_context: matchedContext,
    });
  }
});

test("ambiguous context is REVIEW_REQUIRED, not guessed", () => {
  assert.deepEqual(disambiguateHakaru("結果をはかる。"), {
    reading_kana: "はかる",
    target_kanji: null,
    certainty: "REVIEW_REQUIRED",
    source_rule_id: null,
    matched_context: null,
  });
});

test("single-kanji terms do not match inside longer kanji compounds", () => {
  assert.equal(disambiguateHakaru("数学の宿題をはかる。").certainty, "REVIEW_REQUIRED");
});

test("longest source term handles the official 身長と体重 note deterministically", () => {
  assert.equal(disambiguateHakaru("身長と体重をはかる。").target_kanji, "測");
});

test("rule data has complete provenance and a named human freeze approval", () => {
  const source = provenance.sources.find((entry) => entry.dataset.startsWith("hakaru_disambiguation"));
  assert.ok(source);
  assert.equal(rules.rules.length, 4);
  assert.deepEqual(new Set(rules.rules.map((rule) => rule.target_kanji)), new Set(["図", "計", "測", "量"]));
  for (const rule of rules.rules) {
    assert.ok(rule.source_page > 0);
    assert.match(rules.source_sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(source.file_hash.value, rules.source_sha256);
  assert.equal(source.content_verification.status, "frozen");
  assert.equal(source.content_verification.verified_by, "Brian Fu");
  assert.equal(source.content_verification.verified_at, "2026-08-17");
  assert.deepEqual(getHakaruRuleTableStatus(), {
    verification_status: "frozen",
    verified_by: "Brian Fu",
    verified_at: "2026-08-17",
    source_sha256: rules.source_sha256,
  });
});

test("regression output is byte-identical across repeated runs", () => {
  const run = () => JSON.stringify(cases.map(([context]) => disambiguateHakaru(context)));
  const expected = run();
  for (let i = 0; i < 100; i += 1) assert.equal(run(), expected);
});
