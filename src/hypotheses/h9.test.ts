import test from "node:test";
import assert from "node:assert/strict";

import { evaluateH9Aggregate } from "./h9";

const thresholds = { minimumObservationsPerSide: 5, accuracyGapThreshold: 0.4 };

test("aggregate recognition-production gap emits H9 only at the configured floor and threshold", () => {
  assert.deepEqual(
    evaluateH9Aggregate(
      { recognitionAttempts: 5, recognitionCorrect: 5, productionAttempts: 5, productionCorrect: 3 },
      thresholds,
    ),
    { hypothesis: "H9", recognitionAccuracy: 1, productionAccuracy: 0.6, gap: 0.4 },
  );
});

test("minimum observation floor is a hard gate on each side", () => {
  assert.equal(evaluateH9Aggregate(
    { recognitionAttempts: 5, recognitionCorrect: 5, productionAttempts: 4, productionCorrect: 0 },
    thresholds,
  ), null);
  assert.equal(evaluateH9Aggregate(
    { recognitionAttempts: 4, recognitionCorrect: 4, productionAttempts: 5, productionCorrect: 0 },
    thresholds,
  ), null);
});

test("similar high or low accuracies produce no H9 evidence", () => {
  assert.equal(evaluateH9Aggregate(
    { recognitionAttempts: 5, recognitionCorrect: 5, productionAttempts: 5, productionCorrect: 5 },
    thresholds,
  ), null);
  assert.equal(evaluateH9Aggregate(
    { recognitionAttempts: 5, recognitionCorrect: 1, productionAttempts: 5, productionCorrect: 0 },
    thresholds,
  ), null);
});

test("invalid aggregates and unsafe sample-floor configuration fail loudly", () => {
  assert.throws(() => evaluateH9Aggregate(
    { recognitionAttempts: 4, recognitionCorrect: 5, productionAttempts: 5, productionCorrect: 0 },
    thresholds,
  ), /cannot exceed/);
  assert.throws(() => evaluateH9Aggregate(
    { recognitionAttempts: 5, recognitionCorrect: 5, productionAttempts: 5, productionCorrect: 0 },
    { ...thresholds, minimumObservationsPerSide: 2 },
  ), /at least 3/);
});
