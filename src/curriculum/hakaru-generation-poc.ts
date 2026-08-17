import { getRuntimeConfig } from "../config/runtime";
import { callProvider, type GenerationRequest, type LlmProvider, type PiiContext } from "../llm/provider";
import { disambiguateHakaru, type DisambiguationResult } from "./disambiguation";

export type HakaruTarget = "測" | "計" | "量" | "図";

export interface HakaruGenerationAttempt {
  attempt: number;
  sentence: string | null;
  llm_intended_answer: string | null;
  disambiguation: DisambiguationResult | null;
  decision: "PASS" | "REGENERATE";
  reason: string;
}

export interface HakaruGenerationOutcome {
  target: HakaruTarget;
  outcome: "PASS" | "REJECT";
  attempts: HakaruGenerationAttempt[];
  item?: {
    sentence: string;
    blank_start: number;
    blank_end: number;
    correct_answer: HakaruTarget;
  };
}

const TENANTLESS_POC: PiiContext = {
  kind: "tenantless",
  attestation: "caller-attests-no-tenant-data-in-scope",
};

function promptFor(target: HakaruTarget, previousFailure?: string): string {
  return [
    "日本語の漢字ワークシート用に、自然な短文を一つ作ってください。",
    `今回の正答として意図する漢字は「${target}」です。`,
    "文中の解答位置には漢字を書かず、読みを正確に「はかる」と平仮名で一度だけ書いてください。",
    "正答が周囲の文脈だけで一意に分かる文にしてください。",
    'JSONのみを返してください: {"sentence":"...", "intended_answer":"..."}',
    previousFailure ? `前回は検証を通過しませんでした: ${previousFailure}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseCandidate(text: string): { sentence: string; intended_answer: string } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  const value = JSON.parse(cleaned) as { sentence?: unknown; intended_answer?: unknown };
  if (typeof value.sentence !== "string" || typeof value.intended_answer !== "string") {
    throw new Error("provider response must contain string sentence and intended_answer fields");
  }
  return { sentence: value.sentence.normalize("NFC"), intended_answer: value.intended_answer.normalize("NFC") };
}

function requestFor(target: HakaruTarget): GenerationRequest {
  return {
    grade: 4,
    kanken_level: 7,
    allowed_bare: [],
    allowed_with_ruby: [],
    target_kanji: target,
    target_reading_id: 0,
    item_type: "homophone",
    span_role_profile: "target",
    topic_hint: "日常生活",
    exclude_item_ids: [],
    cohort_exclude_item_ids: [],
  };
}

export async function generateValidatedHakaruItem(
  provider: LlmProvider,
  target: HakaruTarget,
  options: { maxAttempts?: number; pii?: PiiContext } = {},
): Promise<HakaruGenerationOutcome> {
  const maxAttempts = options.maxAttempts ?? getRuntimeConfig().generationRetryCount;
  const attempts: HakaruGenerationAttempt[] = [];
  let previousFailure: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let candidate: { sentence: string; intended_answer: string };
    try {
      const response = await callProvider(
        provider,
        requestFor(target),
        promptFor(target, previousFailure),
        options.pii ?? TENANTLESS_POC,
      );
      candidate = parseCandidate(response.text);
    } catch (error) {
      previousFailure = error instanceof Error ? error.message : String(error);
      attempts.push({
        attempt,
        sentence: null,
        llm_intended_answer: null,
        disambiguation: null,
        decision: "REGENERATE",
        reason: previousFailure,
      });
      continue;
    }

    const blankStart = candidate.sentence.indexOf("はかる");
    if (blankStart === -1 || candidate.sentence.indexOf("はかる", blankStart + 1) !== -1) {
      previousFailure = 'sentence must contain exactly one literal "はかる"';
      attempts.push({
        attempt,
        sentence: candidate.sentence,
        llm_intended_answer: candidate.intended_answer,
        disambiguation: null,
        decision: "REGENERATE",
        reason: previousFailure,
      });
      continue;
    }

    const disambiguation = disambiguateHakaru(candidate.sentence);
    if (disambiguation.certainty === "CONFIDENT" && disambiguation.target_kanji === target) {
      attempts.push({
        attempt,
        sentence: candidate.sentence,
        llm_intended_answer: candidate.intended_answer,
        disambiguation,
        decision: "PASS",
        reason: "deterministic result matches the round target",
      });
      return {
        target,
        outcome: "PASS",
        attempts,
        item: {
          sentence: candidate.sentence,
          blank_start: blankStart,
          blank_end: blankStart + "はかる".length,
          correct_answer: disambiguation.target_kanji,
        },
      };
    }

    previousFailure =
      disambiguation.certainty === "REVIEW_REQUIRED"
        ? "deterministic result is REVIEW_REQUIRED"
        : `deterministic result ${disambiguation.target_kanji} does not match target ${target}`;
    attempts.push({
      attempt,
      sentence: candidate.sentence,
      llm_intended_answer: candidate.intended_answer,
      disambiguation,
      decision: "REGENERATE",
      reason: previousFailure,
    });
  }

  return { target, outcome: "REJECT", attempts };
}

