import test from "node:test";
import assert from "node:assert/strict";

import type { LlmProvider } from "../llm/provider";
import { generateValidatedHakaruItem } from "./hakaru-generation-poc";

function scriptedProvider(responses: string[]): LlmProvider {
  let index = 0;
  return {
    name: "scripted-test-provider",
    generate: async () => ({ text: responses[index++] ?? "{}", model: "scripted" }),
  };
}

test("regenerates after REVIEW_REQUIRED and records only the deterministic answer", async () => {
  const result = await generateValidatedHakaruItem(
    scriptedProvider([
      '{"sentence":"結果をはかる。","intended_answer":"測"}',
      '{"sentence":"川の水深をはかる。","intended_answer":"測"}',
    ]),
    "測",
    { maxAttempts: 3 },
  );

  assert.equal(result.outcome, "PASS");
  assert.deepEqual(result.attempts.map(({ decision }) => decision), ["REGENERATE", "PASS"]);
  assert.equal(result.attempts[0]!.disambiguation!.certainty, "REVIEW_REQUIRED");
  assert.equal(result.item!.correct_answer, "測");
  assert.equal(result.item!.sentence.slice(result.item!.blank_start, result.item!.blank_end), "はかる");
});

test("LLM intent cannot override a mismatched deterministic result", async () => {
  const result = await generateValidatedHakaruItem(
    scriptedProvider(['{"sentence":"体重をはかる。","intended_answer":"計"}']),
    "計",
    { maxAttempts: 1 },
  );

  assert.equal(result.outcome, "REJECT");
  assert.equal(result.attempts[0]!.llm_intended_answer, "計");
  assert.equal(result.attempts[0]!.disambiguation!.target_kanji, "量");
  assert.equal(result.attempts[0]!.decision, "REGENERATE");
});

