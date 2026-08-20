import { spawn } from "node:child_process";

import { callProvider, type GenerationRequest, type LlmProvider } from "../src/llm/provider";

const initialCases = [
  { pair: "王/玉", attempt: 1, target: "王", substitute: "玉", sentence: "王さまは城で国を治めています。" },
  { pair: "未/末", attempt: 1, target: "未", substitute: "末", sentence: "私は未来の夢を作文に書いた。" },
  { pair: "土/士", attempt: 1, target: "土", substitute: "士", sentence: "畑の土をやわらかく耕した。" },
  { pair: "人/入", attempt: 1, target: "人", substitute: "入", sentence: "あの人は親切な先生です。" },
  { pair: "目/日", attempt: 1, target: "目", substitute: "日", sentence: "目を閉じて静かに音を聞いた。" },
  { pair: "大/犬", attempt: 1, target: "大", substitute: "犬", sentence: "大きな犬が庭を走っている。" },
] as const;

const retryCases = [
  { pair: "王/玉", attempt: 2, target: "王", substitute: "玉", sentence: "王子さまが白馬に乗って現れた。" },
  { pair: "未/末", attempt: 2, target: "未", substitute: "末", sentence: "映画に未来人が登場した。" },
  { pair: "人/入", attempt: 2, target: "人", substitute: "入", sentence: "三人で公園に行った。" },
] as const;

const thirdCases = [
  { pair: "王/玉", attempt: 3, target: "王", substitute: "玉", sentence: "その王国は長い歴史を持っている。" },
  { pair: "人/入", attempt: 3, target: "人", substitute: "入", sentence: "警察が犯人を捕まえた。" },
] as const;

const cases = process.env.H8_RETRY_ROUND === "3" ? thirdCases : process.env.H8_RETRY_ONLY === "1" ? retryCases : initialCases;

class CodexCliProvider implements LlmProvider {
  readonly name = "codex-cli";
  constructor(private readonly executable: string, private readonly model: string) {}

  async generate(prompt: string) {
    const args = [
      "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only",
      "--skip-git-repo-check", "--color", "never", "--model", this.model,
      "-c", 'model_reasoning_effort="low"', prompt,
    ];
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.executable, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
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
  return {
    grade: 4, kanken_level: 7, allowed_bare: [], allowed_with_ruby: [], target_kanji: target,
    target_reading_ids: [0], item_type: "diagnostic", span_role_profile: "diagnostic_probe",
    diagnostic_objective: "probe", target_hypotheses: ["H8"], contrast_kanji: null,
    topic_hint: "日常生活", exclude_item_ids: [], cohort_exclude_item_ids: [],
  };
}

const results = [];
for (const item of cases) {
  const counterfactual = item.sentence.replace(item.target, item.substitute);
  console.error(`${item.pair}: counterfactual`);
  const rating = await callProvider(
    provider,
    request(item.target),
    `次の日本語文が、誤字としてではなく通常の現代日本語として意味・文法とも自然に成立するか判定してください。説明せずJSONのみ: {"acceptable":true|false}\n文: ${counterfactual}`,
    pii,
  );
  const acceptable = (JSON.parse(rating.text) as { acceptable: boolean }).acceptable;
  const clozeSentence = item.sentence.replace(item.target, "□");
  const clozeAnswers: string[] = [];
  for (let sample = 1; sample <= 5; sample += 1) {
    console.error(`${item.pair}: cloze ${sample}/5`);
    const response = await callProvider(
      provider,
      request(item.target),
      `次の文の□に入る漢字一字を答えてください。説明せずJSONのみ: {"answer":"漢字一字"}\n文: ${clozeSentence}`,
      pii,
    );
    clozeAnswers.push((JSON.parse(response.text) as { answer: string }).answer);
  }
  results.push({
    ...item,
    counterfactual,
    counterfactual_acceptable: acceptable,
    cloze_sentence: clozeSentence,
    cloze_answers: clozeAnswers,
    unanimous_cloze: clozeAnswers.every((answer) => answer === item.target),
    discriminates: !acceptable && clozeAnswers.every((answer) => answer === item.target),
    admission_status: "PENDING_HUMAN_PRUNING",
  });
}
console.log(JSON.stringify({ model, k: 5, results }, null, 2));
