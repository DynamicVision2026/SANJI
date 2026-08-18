import test from "node:test";
import assert from "node:assert/strict";

import pilot from "../curriculum/data/h2_onkun_pilot.json";
import cloze from "../curriculum/data/h2_blind_cloze_results.json";
import { classifyOnKun } from "./h2";

test("all ten source-backed on/kun contrasts classify deterministically", () => {
  assert.equal(pilot.cases.length, 10);
  for (const item of pilot.cases) {
    assert.equal(classifyOnKun(item.kanji, item.target_reading, item.target_reading).classification, "CORRECT");
    assert.deepEqual(classifyOnKun(item.kanji, item.target_reading, item.alternate_reading), {
      classification: "H2",
      expected_reading: item.target_reading,
      observed_reading: item.alternate_reading,
      source_page: item.source_page,
    });
  }
});

test("hiragana and katakana input normalize to the same source reading", () => {
  assert.deepEqual(classifyOnKun("生", "せい", "なま"), classifyOnKun("生", "セイ", "なま"));
});

test("same-type alternatives and unknown readings are not guessed into H2", () => {
  assert.deepEqual(classifyOnKun("生", "セイ", "ショウ"), { classification: "UNCLASSIFIED" });
  assert.deepEqual(classifyOnKun("生", "セイ", "タイミング"), { classification: "UNCLASSIFIED" });
});

test("stage filtering excludes readings above the learner's stage", () => {
  assert.deepEqual(classifyOnKun("下", "カ", "もと", "elementary"), { classification: "UNCLASSIFIED" });
});

test("all ten contrast halves passed the required five-sample blind cloze", () => {
  assert.equal(cloze.model, "gpt-5.5");
  assert.equal(cloze.k, 5);
  assert.equal(cloze.results.length, 10);
  for (const result of cloze.results) {
    assert.equal(result.answers.length, 5, result.sentence);
    assert.equal(result.unanimous, true, result.sentence);
  }
});
