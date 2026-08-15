#!/usr/bin/env node
/**
 * §15.2 PII Privacy Gate — partial real check.
 *
 * Full check (§15.2): build fails if any field originating from students, users,
 * branches, or organizations is reachable from the LLM client; all model calls
 * pass through a single choke point with an outbound scrubber + assertion.
 *
 * Implemented now (cheap, high-value): no source file may import a vendor LLM
 * SDK directly — all calls MUST go through the provider abstraction
 * (src/llm/provider.ts, §8.1). A direct vendor import is exactly the code path
 * that bypasses the §15.2 choke point, so we fail the build on one.
 *
 * Rationale (§15.2): sales material states 生徒の個人情報は生成AIに送信しません.
 * It must be literally true.
 */
import { REPO_ROOT, failGate, passGate, readFileSync, walk } from "./_common.mjs";
import { join } from "node:path";

// Vendor SDK import specifiers that must never appear outside an approved
// adapter. Adapters live under src/llm/adapters/ (none exist yet in Week 1).
const VENDOR_SDKS = [
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@google-cloud/vertexai",
  "cohere-ai",
  "@mistralai/mistralai",
  "@aws-sdk/client-bedrock-runtime",
];
const ADAPTER_PREFIX = join("src", "llm", "adapters");

const files = walk(join(REPO_ROOT, "src")).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
const violations = [];

for (const file of files) {
  const rel = file.slice(REPO_ROOT.length + 1);
  if (rel.startsWith(ADAPTER_PREFIX)) continue; // approved adapter location
  const text = readFileSync(file, "utf8");
  for (const sdk of VENDOR_SDKS) {
    const re = new RegExp(`(import|require)[^\\n]*['"]${sdk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|['"])`);
    if (re.test(text)) {
      violations.push(`${rel} imports vendor SDK '${sdk}' outside src/llm/adapters/ (§8.1)`);
    }
  }
}

if (violations.length > 0) {
  failGate("PII Privacy Gate", "§15.2", violations);
}
passGate(
  "PII Privacy Gate",
  "§15.2",
  `no direct vendor SDK imports; all model calls route through the provider choke point (${files.length} files scanned). Full outbound-scrubber assertion follows the generation pipeline (§7, Week 3).`,
);
