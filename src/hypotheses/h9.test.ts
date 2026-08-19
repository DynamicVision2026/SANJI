import test from "node:test";
import assert from "node:assert/strict";

import { h9Evidence, pairH9Items } from "./h9";

const items = [
  { id: "r-hashi", target_kanji: "橋", target_reading_id: 101, item_type: "yomi" },
  { id: "w-hashi", target_kanji: "橋", target_reading_id: 101, item_type: "kakitori" },
  { id: "w-hashi-other-reading", target_kanji: "橋", target_reading_id: 102, item_type: "kakitori" },
  { id: "r-kawa", target_kanji: "川", target_reading_id: 201, item_type: "yomi" },
  { id: "r-kawa-2", target_kanji: "川", target_reading_id: 201, item_type: "yomi" },
  { id: "diagnostic-kawa", target_kanji: "川", target_reading_id: 201, item_type: "diagnostic" },
] as const;

test("pairs one recognition and one production item only for the same kanji and reading", () => {
  assert.deepEqual(pairH9Items(items), [
    {
      recognition_item_id: "r-hashi",
      production_item_id: "w-hashi",
      target_kanji: "橋",
      target_reading_id: 101,
    },
  ]);
});

test("recognition-correct/production-wrong divergence records H9 evidence", () => {
  const pair = pairH9Items(items)[0]!;
  assert.deepEqual(
    h9Evidence(pair, [
      { item_id: "r-hashi", is_correct: true },
      { item_id: "w-hashi", is_correct: false },
    ]),
    {
      hypothesis: "H9",
      target_kanji: "橋",
      target_reading_id: 101,
      recognition_correct: true,
      production_correct: false,
      item_ids: ["r-hashi", "w-hashi"],
    },
  );
});

test("matching correctness or an incomplete pair produces no H9 evidence", () => {
  const pair = pairH9Items(items)[0]!;
  assert.equal(
    h9Evidence(pair, [
      { item_id: "r-hashi", is_correct: true },
      { item_id: "w-hashi", is_correct: true },
    ]),
    null,
  );
  assert.equal(h9Evidence(pair, [{ item_id: "r-hashi", is_correct: true }]), null);
});

