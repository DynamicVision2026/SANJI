#!/usr/bin/env node
/**
 * §6.5 curriculum coverage gate (CI).
 *
 * Runs the frozen §6.5 assertions against src/curriculum/data:
 *   - per-grade counts 80/160/200/202/193/191, total 1,026
 *   - duplicate detection
 *   - checksum over the frozen sorted character set (substitution guard)
 *
 * This is a REAL gate (not a stub): it exits non-zero on any violation, which
 * is the concrete proof that the CI pipeline can fail the build (issue §1).
 *
 * Implemented in plain ESM (no build step) so CI can run it fast. The assertion
 * logic lives in src/curriculum/ingest.ts; here we re-implement the same three
 * checks over the JSON directly to keep the gate dependency-free. The ingest
 * test (npm test) exercises the TypeScript path and asserts they agree.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "src", "curriculum", "data");

const EXPECTED_COUNTS = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
const EXPECTED_TOTAL = 1026;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

const rows = JSON.parse(
  readFileSync(join(DATA_DIR, "kanji_teach_grade.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(join(DATA_DIR, "kanji_teach_grade.checksum.json"), "utf8"),
);

// Duplicate detection.
const seen = new Map();
for (const r of rows) seen.set(r.kanji, (seen.get(r.kanji) ?? 0) + 1);
const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
if (dupes.length > 0) fail(`Duplicate characters: ${dupes.join("")}`);

// Per-grade counts + total.
const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
for (const r of rows) {
  if (counts[r.teach_grade] === undefined) {
    fail(`Character ${r.kanji} has out-of-range teach_grade ${r.teach_grade}`);
    continue;
  }
  counts[r.teach_grade] += 1;
}
for (const g of [1, 2, 3, 4, 5, 6]) {
  if (counts[g] !== EXPECTED_COUNTS[g]) {
    fail(`Grade ${g} count is ${counts[g]}, expected ${EXPECTED_COUNTS[g]}`);
  }
}
if (rows.length !== EXPECTED_TOTAL) {
  fail(`Total is ${rows.length}, expected ${EXPECTED_TOTAL}`);
}

// Checksum over the frozen sorted unique character set.
const sorted = [...new Set(rows.map((r) => r.kanji))].sort();
const checksum = createHash("sha256").update(sorted.join(""), "utf8").digest("hex");
if (checksum !== manifest.checksum) {
  fail(
    `Checksum mismatch: computed ${checksum}, frozen ${manifest.checksum}. ` +
      `A character was substituted, added, or removed since the set was frozen.`,
  );
}

if (process.exitCode === 1) {
  console.error("\n§6.5 curriculum coverage gate: FAILED");
  process.exit(1);
}

console.log(
  `✓ §6.5 curriculum coverage gate: PASS — ${rows.length} characters, ` +
    `grades ${[1, 2, 3, 4, 5, 6].map((g) => counts[g]).join("/")}, checksum ok`,
);
