import { spawn } from "node:child_process";

import { generateValidatedHakaruItem, type HakaruTarget } from "../src/curriculum/hakaru-generation-poc";
import type { LlmProvider } from "../src/llm/provider";

class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generate(prompt: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });
    if (!response.ok) throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("LLM response contained no message text");
    return { text, model: this.model };
  }
}

const model = process.env.LLM_MODEL ?? (() => { throw new Error("Set LLM_MODEL"); })();

class CodexCliProvider implements LlmProvider {
  readonly name = "codex-cli";

  constructor(
    private readonly executable: string,
    private readonly model: string,
  ) {}

  async generate(prompt: string) {
    const args = [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--model",
      this.model,
      "-c",
      'model_reasoning_effort="low"',
      prompt,
    ];
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.executable, args, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let errorOutput = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (errorOutput += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(output) : reject(new Error(`Codex CLI exited ${code}: ${errorOutput.slice(-1000)}`)),
      );
    });
    return { text: stdout.trim(), model: this.model };
  }
}

function configuredProvider(): LlmProvider {
  if (process.env.LLM_PROVIDER === "codex-cli") {
    const executable = process.env.LLM_CLI_PATH;
    if (!executable) throw new Error("Set LLM_CLI_PATH for LLM_PROVIDER=codex-cli");
    return new CodexCliProvider(executable, model);
  }

  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("Set LLM_API_KEY and LLM_BASE_URL for the HTTP provider");
  return new OpenAiCompatibleProvider(apiKey, baseUrl, model);
}

const provider = configuredProvider();
const targets: HakaruTarget[] = ["測", "計", "量", "図"];
const outcomes = [];
for (const target of targets) outcomes.push(await generateValidatedHakaruItem(provider, target));
console.log(JSON.stringify({ provider: provider.name, model, outcomes }, null, 2));
