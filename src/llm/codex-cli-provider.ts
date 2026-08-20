import { spawn } from "node:child_process";

import type { LlmProvider, ProviderResponse } from "./provider";

/** Minimal concrete L1/L5 adapter; all outbound calls still pass callProvider. */
export class CodexCliProvider implements LlmProvider {
  readonly name = "codex-cli";

  constructor(
    private readonly executable: string,
    private readonly model: string,
  ) {
    if (!executable) throw new Error("Codex CLI executable is required");
    if (!model) throw new Error("Codex model is required");
  }

  async generate(prompt: string): Promise<ProviderResponse> {
    const args = [
      "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules",
      "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never",
      "--model", this.model, "-c", 'model_reasoning_effort="low"', prompt,
    ];
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.executable, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Codex CLI exited ${code}: ${stderr.slice(-1000)}`));
      });
    });
    return { text, model: this.model };
  }
}
