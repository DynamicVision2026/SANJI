import test from "node:test";
import assert from "node:assert/strict";

import lexicalRules from "../curriculum/data/lexical_reading_rule.json";
import { classifyH7 } from "./h7";

const pilots = [
  ["今日", "きょう", "いまひ", ["きょう"], 50],
  ["大人", "おとな", "だいじん", ["おとな"], 50],
  ["明日", "あす", "めいにち", ["あした", "あす"], 50],
  ["一日", "ついたち", "いちにち", ["ついたち"], 50],
  ["二十歳", "はたち", "にじゅうさい", ["はたち"], 51],
  ["七夕", "たなばた", "しちせき", ["たなばた"], 50],
] as const;

test("all 123 delivered 付表1 rows are available as whole-surface jukujikun rules", () => {
  assert.equal(lexicalRules.filter((rule) => rule.rule_kind === "jukujikun").length, 123);
});

for (const [surface, correct, characterByCharacter, validReadings, sourcePage] of pilots) {
  test(`${surface}/${correct} resolves before character-level fallback`, () => {
    assert.equal(classifyH7(surface, correct).classification, "CORRECT");
    assert.deepEqual(classifyH7(surface, characterByCharacter), {
      classification: "H7",
      expected_readings: [...validReadings],
      source_page: sourcePage,
    });
  });
}

test("明日の curated alternate reading is correct and its compositional reading is closed-set H7", () => {
  assert.deepEqual(classifyH7("明日", "あした"), {
    classification: "CORRECT",
    rule_kind: "jukujikun",
    source_page: null,
    reading_variant_id: "rv-ashita",
  });
  assert.deepEqual(classifyH7("明日", "みょうにち"), {
    classification: "H7",
    expected_readings: ["あした", "あす"],
    source_page: 50,
  });
});

test("an unknown response is not promoted to H7 merely because it differs from the lexical reading", () => {
  assert.deepEqual(classifyH7("明日", "でたらめ"), { classification: "UNCLASSIFIED" });
});

test("人気/にんき is not mislabelled H7 when it has no 付表 rule", () => {
  assert.deepEqual(classifyH7("人気", "にんき"), { classification: "UNCLASSIFIED" });
});

test("NFC and NFD student readings produce the same CORRECT result", () => {
  const nfc = classifyH7("七夕", "たなばた");
  const nfd = classifyH7("七夕", "たなばた".normalize("NFD"));
  assert.deepEqual(nfc, { classification: "CORRECT", rule_kind: "jukujikun", source_page: 50 });
  assert.deepEqual(nfd, nfc);
});

test("malformed and empty inputs fail safely without broadening H7", () => {
  assert.deepEqual(classifyH7("", "たなばた"), { classification: "UNCLASSIFIED" });
  assert.deepEqual(classifyH7("七夕", ""), { classification: "UNCLASSIFIED" });
  assert.deepEqual(classifyH7(null as unknown as string, "たなばた"), { classification: "UNCLASSIFIED" });
});
