/**
 * Shared helpers for the six §15 build-gate scripts.
 *
 * Each gate exits non-zero on violation so CI can fail the build. A gate whose
 * real inputs do not exist yet (regression set, live DB, generated worksheets)
 * runs as an explicit STUB that references its spec section and the silent
 * failure mode it will guard — it passes for now but is wired into CI so the
 * skeleton is real (issue §1: "able to fail the build").
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function passGate(name, section, detail) {
  console.log(`✓ ${name} (${section}): PASS${detail ? ` — ${detail}` : ""}`);
  process.exit(0);
}

export function failGate(name, section, reasons) {
  const list = Array.isArray(reasons) ? reasons : [reasons];
  console.error(`✗ ${name} (${section}): FAIL`);
  for (const r of list) console.error(`  - ${r}`);
  process.exit(1);
}

export function stubGate(name, section, guards, deliveredBy) {
  console.log(`● ${name} (${section}): STUB — not yet implemented.`);
  console.log(`  Guards against: ${guards}`);
  console.log(`  Real inputs delivered: ${deliveredBy}`);
  console.log(`  Wired into CI now so the pipeline is real; exits 0 until implemented.`);
  process.exit(0);
}

/** Recursively walk files under a directory, skipping node_modules/.next/.git. */
export function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (["node_modules", ".next", ".git", "out", "build", "coverage"].includes(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export { readFileSync, join };
