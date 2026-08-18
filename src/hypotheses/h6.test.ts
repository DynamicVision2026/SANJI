import test from "node:test";
import assert from "node:assert/strict";

import data from "../curriculum/data/okurigana_pilot.json";
import { classifyOkurigana } from "./h6";

test("all ten source-backed wrong forms classify deterministically as H6", () => {
  assert.equal(data.rules.length, 10);
  for (const rule of data.rules) {
    for (const accepted of rule.accepted_forms) assert.equal(classifyOkurigana(rule.id, accepted), "CORRECT", accepted);
    for (const rejected of rule.rejected_forms) assert.equal(classifyOkurigana(rule.id, rejected), "H6", rejected);
    assert.equal(rule.source_page, 3);
  }
});
test("the official 許容 forms are not used as false H6 distractors", () => {
  for (const [id, forms] of [
    ["h6-okonau", ["行う", "行なう"]],
    ["h6-arawasu", ["表す", "表わす"]],
    ["h6-kotowaru", ["断る", "断わる"]],
  ] as const) {
    for (const form of forms) assert.equal(classifyOkurigana(id, form), "CORRECT");
  }
});

test("an uncatalogued typo is not guessed into H6", () => {
  assert.equal(classifyOkurigana("h6-okonau", "行っう"), "UNCLASSIFIED");
});
