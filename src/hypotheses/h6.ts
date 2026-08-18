import data from "../curriculum/data/okurigana_pilot.json";

export type H6Result = "CORRECT" | "H6" | "UNCLASSIFIED";

export function classifyOkurigana(ruleId: string, answer: string): H6Result {
  const rule = data.rules.find(({ id }) => id === ruleId);
  if (!rule) throw new Error(`unknown okurigana rule: ${ruleId}`);
  const normalized = answer.normalize("NFC");
  if (rule.accepted_forms.includes(normalized)) return "CORRECT";
  if (rule.rejected_forms.includes(normalized)) return "H6";
  return "UNCLASSIFIED";
}
