import test from "node:test";
import assert from "node:assert/strict";

import data from "../curriculum/data/okurigana_pilot.json";
import { classifyOkurigana } from "./h6";

test("all ten table controls classify deterministically and carry the exact official clause identifier", () => {
  const clauseByRule: Record<string, string> = {
    "h6-akiramu": "tsusoku1.reigai.3",
    "h6-ajiwau": "tsusoku1.reigai.3",
    "h6-itsukushimu": "tsusoku1.reigai.3",
    "h6-kakawaru": "tsusoku1.reigai.3",
    "h6-ugokasu": "tsusoku2.honsoku.1",
    "h6-terasu": "tsusoku2.honsoku.1",
    "h6-hakarau": "tsusoku2.honsoku.1",
    "h6-okonau": "tsusoku1.kyoyo",
    "h6-arawasu": "tsusoku1.kyoyo",
    "h6-kotowaru": "tsusoku1.kyoyo",
  };
  assert.equal(data.rules.length, 10);
  for (const rule of data.rules) {
    for (const accepted of rule.accepted_forms) assert.equal(classifyOkurigana(rule.id, accepted), "CORRECT", accepted);
    for (const rejected of rule.rejected_forms) assert.equal(classifyOkurigana(rule.id, rejected), "H6", rejected);
    assert.equal(rule.source_page, 3);
    assert.equal(rule.clause_id, clauseByRule[rule.id]);
  }
});

test("collision-free replacements classify as H6 without capturing the three real homographs", () => {
  for (const [id, replacement, homograph] of [
    ["h6-akiramu", "明ららむ", "明るむ"],
    ["h6-kakawaru", "関わわる", "関る"],
    ["h6-okonau", "行ななう", "行る"],
  ] as const) {
    assert.equal(classifyOkurigana(id, replacement), "H6");
    assert.equal(classifyOkurigana(id, homograph), "UNCLASSIFIED");
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

test("the three 許容 rows are classifier sanity checks, not representative curriculum errors", () => {
  for (const [id, sanityCheck] of [
    ["h6-okonau", "行ななう"],
    ["h6-arawasu", "表る"],
    ["h6-kotowaru", "断のる"],
  ] as const) {
    assert.equal(classifyOkurigana(id, sanityCheck), "H6");
    assert.equal(data.rules.find((rule) => rule.id === id)?.clause_id, "tsusoku1.kyoyo");
  }
});

test("an uncatalogued typo is not guessed into H6", () => {
  assert.equal(classifyOkurigana("h6-okonau", "行っう"), "UNCLASSIFIED");
});
