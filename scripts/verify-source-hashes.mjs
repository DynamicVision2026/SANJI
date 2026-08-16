#!/usr/bin/env node
/**
 * §6.5 PDF hash verification (v2.3, MUST be automated).
 *
 * For every source in the repo-root provenance manifest with a CONFIRMED file
 * hash, download the official PDF from its recorded URL, compute SHA-256, and
 * FAIL on mismatch with the committed hash. This is the check §6.1.1 states
 * has real protective value: it detects republication of the source document
 * or substitution of the file. It is NOT waived and runs automatically on any
 * change to curriculum data (see .github/workflows/fetch-mext-source-and-hash.yml).
 *
 * Requires network egress to mext.go.jp — it runs on GitHub's hosted runners,
 * not in sandboxes without egress. A download failure is reported as a failure
 * (loudly), distinct from a hash mismatch: an unreachable source cannot verify
 * anything and must not silently pass.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Manifest path may be overridden (argv[2]) so the failure paths are testable
// without touching the real manifest. Default is the committed repo-root file.
const manifestPath = process.argv[2] ?? join(ROOT, "sources_provenance.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

let failures = 0;
let verified = 0;

for (const source of manifest.sources ?? []) {
  const label = source.dataset ?? "(unnamed source)";
  const hash = source.file_hash;

  if (hash?.status !== "CONFIRMED") {
    console.log(`● ${label}: file_hash.status=${hash?.status ?? "absent"} — nothing to verify yet (pre-ingestion source)`);
    continue;
  }
  const url = source.actual_pdf_url_used;
  if (!url) {
    console.error(`✗ ${label}: CONFIRMED hash but no actual_pdf_url_used recorded — cannot verify`);
    failures += 1;
    continue;
  }

  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new Error("response is not a PDF (magic bytes missing) — likely an error page");
    }
    const computed = createHash("sha256").update(bytes).digest("hex");
    const committed = (hash.value ?? "").toLowerCase();
    if (computed !== committed) {
      console.error(
        `✗ ${label}: HASH MISMATCH — committed ${committed}, computed ${computed} (${bytes.length} bytes). ` +
          `The source document was republished or substituted; re-verify provenance before trusting the extracted data (§6.1.1).`,
      );
      failures += 1;
    } else {
      console.log(`✓ ${label}: SHA-256 verified against ${url} (${bytes.length} bytes)`);
      verified += 1;
    }
  } catch (error) {
    console.error(`✗ ${label}: download/verify failed for ${url}: ${error.message}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n§6.5 hash verification: FAILED (${failures} source(s))`);
  process.exit(1);
}
console.log(`\n§6.5 hash verification: PASS (${verified} source(s) verified)`);
