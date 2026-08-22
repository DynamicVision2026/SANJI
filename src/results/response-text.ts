export function normalizeResponseText(value: string): string {
  return value.normalize("NFC").trim();
}

/**
 * Backward compatibility:
 * - omitted responseText derives response_text from legacy wrongAnswerText;
 * - an explicit responseText is authoritative only after any supplied legacy
 *   wrongAnswerText is shown to agree;
 * - incorrect captured nonblank responses keep wrong_answer_text populated.
 */
export function resolveResponseText(input: {
  isCorrect: boolean;
  responseText?: string | null;
  wrongAnswerText: string | null;
}): { responseText: string | null; wrongAnswerText: string | null } {
  const legacy = input.wrongAnswerText === null ? null : normalizeResponseText(input.wrongAnswerText);
  if (legacy === "") throw new Error("wrongAnswerText must be null or a non-empty string");

  if (input.responseText === undefined) {
    return { responseText: legacy, wrongAnswerText: legacy };
  }
  if (input.responseText !== null && typeof input.responseText !== "string") {
    throw new Error("responseText must be null or a string");
  }
  const response = input.responseText === null ? null : normalizeResponseText(input.responseText);
  if (legacy !== null && legacy !== response) {
    throw new Error("responseText conflicts with wrongAnswerText");
  }
  if (input.isCorrect && legacy !== null) {
    throw new Error("correct result cannot have wrongAnswerText");
  }
  return {
    responseText: response,
    wrongAnswerText: !input.isCorrect && response ? response : null,
  };
}
