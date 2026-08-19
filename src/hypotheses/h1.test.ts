import test from "node:test";
import assert from "node:assert/strict";

import { recommendH1Activation, type WeightedEvidenceRow } from "./h1";

const row = (kanji: string, weight: number): WeightedEvidenceRow => ({
  kanji,
  weight,
});

test("H1 does not clear three weighted events when only one kanji is represented", () => {
  assert.equal(recommendH1Activation([row("激", 3)]), null);
});

test("H1 does not clear two distinct kanji below three weighted events", () => {
  assert.equal(recommendH1Activation([row("激", 1.4), row("識", 1.5)]), null);
});

test("H1 threshold emits an active recommendation without changing state", () => {
  assert.deepEqual(recommendH1Activation([row("激", 1.5), row("識", 1.5)]), {
    hypothesis: "H1",
    from_status: "undetected",
    to_status: "active",
    weighted_events: 3,
    distinct_kanji: ["激", "識"],
  });
});

test("invalid evidence weights fail loudly", () => {
  assert.throws(() => recommendH1Activation([row("激", -1)]), /finite and non-negative/);
});
