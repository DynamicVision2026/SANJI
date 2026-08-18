import { spawn } from "node:child_process";

import pilot from "../src/curriculum/data/h2_onkun_pilot.json";
import { callProvider, type GenerationRequest, type LlmProvider } from "../src/llm/provider";

class CodexCliProvider implements LlmProvider {
  readonly name = "codex-cli";
  constructor(private readonly executable: string, private readonly model: string) {}
  async generate(prompt: string) {
    const args = ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only",
      "--skip-git-repo-check", "--color", "never", "--model", this.model,
      "-c", 'model_reasoning_effort="low"', prompt];
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.executable, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.slice(-1000))));
    });
    return { text, model: this.model };
  }
}

const executable = process.env.LLM_CLI_PATH;
const model = process.env.LLM_MODEL;
if (!executable || !model) throw new Error("Set LLM_CLI_PATH and LLM_MODEL");
const provider = new CodexCliProvider(executable, model);
const pii = { kind: "tenantless", attestation: "caller-attests-no-tenant-data-in-scope" } as const;

function request(target: string): GenerationRequest {
  return { grade: 4, kanken_level: 7, allowed_bare: [], allowed_with_ruby: [], target_kanji: target,
    target_reading_id: 0, item_type: "diagnostic", span_role_profile: "diagnostic_probe",
    topic_hint: "日常生活", exclude_item_ids: [], cohort_exclude_item_ids: [] };
}

const results = [];
for (const item of pilot.cases) {
  const answers: string[] = [];
  for (let sample = 1; sample <= 5; sample += 1) {
    console.error(`${item.kanji}/${item.target_reading}: ${sample}/5`);
    const response = await callProvider(provider, request(item.kanji),
      `次の文中の【】で囲んだ部分の読みを、送り仮名も含めてひらがなで答えてください。説明せずJSONのみ: {"answer":"よみ"}\n文: ${item.sentence.replace(item.cloze_target, `【${item.cloze_target}】`)}`,
      pii);
    answers.push((JSON.parse(response.text) as { answer: string }).answer);
  }
  const expected = item.target_reading.replace(/[ァ-ヶ]/g, (char) => String.fromCodePoint(char.codePointAt(0)! - 0x60));
  results.push({ ...item, answers, unanimous: answers.every((answer) => answer.normalize("NFC") === expected) });
}
console.log(JSON.stringify({ model, k: 5, results }, null, 2));
