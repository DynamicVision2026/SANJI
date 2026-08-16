#!/usr/bin/env node
/**
 * §15.3 Font Integrity Gate — partial real check (license-blocked full check).
 *
 * Full check (§15.3, when rendering exists Weeks 5–6): render a canary with all
 * 1,026 kyōiku kanji + the allowed_with_ruby set + kana + punctuation + ruby +
 * a proper-noun fixture (髙 﨑 濵 邊), parse the PDF font resource dictionary,
 * and assert EXACTLY ONE embedded font (§9.3 no-fallback).
 *
 * Blocked on the Morisawa 教科書体 server license (§19.1) — font-dependent work
 * is deferred/stubbed and MUST NOT assume unconfirmed license terms.
 *
 * Implemented now: guard the deferral. No font binary may be committed while the
 * license is unconfirmed (§16.4: the font file must never be publicly
 * reachable, and terms are unconfirmed per §19.1). A committed font would be
 * exactly the silent assumption this gate must prevent — so we fail on one.
 */
import { REPO_ROOT, failGate, passGate, walk } from "./_common.mjs";

const FONT_EXT = /\.(otf|ttf|ttc|woff2?|eot)$/i;
const fonts = walk(REPO_ROOT).filter((f) => FONT_EXT.test(f));

if (fonts.length > 0) {
  failGate(
    "Font Integrity Gate",
    "§15.3/§19.1",
    fonts
      .map((f) => f.slice(REPO_ROOT.length + 1))
      .map(
        (rel) =>
          `font binary committed: ${rel} — the Morisawa license is unconfirmed (§19.1) and the font file must never be committed/publicly reachable (§16.4)`,
      ),
  );
}
passGate(
  "Font Integrity Gate",
  "§15.3/§9.2",
  "no font binaries committed (placeholder font is config-marked, never committed; licensed font blocked on §19.1 which gates LAUNCH, not the build). " +
    "Canary CONTENT exists and is unit-tested (src/rendering/fontCanary.ts: all 1,026 kanji + kana + punctuation + 異体字 fixtures + ruby resolved under each ruby_policy). " +
    "The render half — PDF font-resource-dictionary assertion of exactly one embedded font — is NOT yet implemented; it lands with the rendering container (Weeks 5–6, §18.1).",
);
