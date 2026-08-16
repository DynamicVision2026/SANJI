#!/usr/bin/env node
/**
 * §15.2 PII Privacy Gate.
 *
 * v2.3 §15.2: "The gate MUST inspect the actual outbound payload at the §8.1
 * choke point — serialising the request as it would be transmitted and
 * asserting no student-derived value appears in it. A gate that only inspects
 * type signatures, call sites, or intermediate objects does not satisfy this
 * requirement."
 *
 * Two layers, both of which must pass:
 *
 *   1. PAYLOAD INSPECTION (the §15.2 requirement): scripts/gates/
 *      pii-payload-probe.ts runs against the REAL choke point
 *      (src/llm/provider.ts), serialises outbound payloads exactly as they
 *      would be transmitted — free-text prompt included — and asserts fixture
 *      tenant values (students/users/branches/organizations) are rejected and
 *      absent from the serialised bytes. Requires node_modules (tsx).
 *
 *   2. VENDOR-SDK IMPORT SCAN (defence in depth, §8.1): no source file may
 *      import a vendor LLM SDK outside src/llm/adapters/ — a direct import is
 *      the code path that bypasses the choke point entirely.
 *
 * Remaining scope, stated so status is not overstated: the probe exercises the
 * choke point with fixtures. Wiring live tenant rows into PiiContext at
 * generation time is part of the Week 3 pipeline (§7, §18.1) — until then no
 * production code path calls a provider at all.
 *
 * Rationale (§15.2): sales material states 生徒の個人情報は生成AIに送信しません.
 * It must be literally true.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, failGate, passGate, readFileSync, walk } from "./_common.mjs";

// ---------------------------------------------------------------------------
// Layer 1 — payload inspection at the real choke point.
// ---------------------------------------------------------------------------
if (!existsSync(join(REPO_ROOT, "node_modules"))) {
  failGate("PII Privacy Gate", "§15.2", [
    "node_modules missing — the payload probe runs against the real choke point via tsx and requires dependencies. Run `npm ci` before this gate.",
  ]);
}

const probe = spawnSync(
  process.execPath,
  ["--import", "tsx", join(REPO_ROOT, "scripts", "gates", "pii-payload-probe.ts")],
  { cwd: REPO_ROOT, stdio: "inherit" },
);
if (probe.status !== 0) {
  failGate("PII Privacy Gate", "§15.2", [
    "payload probe failed — the §8.1 choke point did not reject (or leaked) tenant-derived values in the serialised outbound payload",
  ]);
}

// ---------------------------------------------------------------------------
// Layer 2 — vendor-SDK import scan (defence in depth).
// ---------------------------------------------------------------------------
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
  `serialised-payload probe holds at the §8.1 choke point (prompt text included) and no direct vendor SDK imports (${files.length} files scanned). Live tenant-row wiring into PiiContext lands with the Week 3 pipeline.`,
);
