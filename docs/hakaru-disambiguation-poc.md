# はかる reading disambiguation PoC

`src/curriculum/disambiguation.ts` performs a deterministic lookup for the
four-kanji PoC family 図る / 計る / 測る / 量る. It uses only the frozen JSON
candidate table; there is no runtime LLM or morphological-analysis fallback.

The lookup follows spec §6.4's first step: it resolves a whole-surface lexical
context before character grade, reading stage, or lexical difficulty checks.
The longest matching source-backed context term wins. No match, or a tie
between different kanji, returns `REVIEW_REQUIRED` instead of guessing.

The source is the Agency for Cultural Affairs report 「異字同訓」の漢字の使い分け例
(2014-02-21), PDF page 26 (printed page 22), SHA-256 recorded in
`sources_provenance.json` and `.yaml`.

## Freeze status

The rule table was reviewed and frozen by Brian Fu on 2026-08-17. This module
remains a PoC and is not integrated into the live generation pipeline.
