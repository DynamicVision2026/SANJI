# H2 on/kun-selection pilot

The pilot uses the canonical repository copy of the MEXT `音訓の小・中・高等学校段階別割り振り表（平成29年3月）` at `sources/raw/ontsun-wariwake-h29-03.pdf`. Its SHA-256 was rechecked as `0bc189982a50122f1e35dd6a751bfdff0ec5a0ad67e99eda916d012f859a5ae4`; the binary was not modified. The PDF text layer was checked directly for 一 (source table p.1), 角 (p.5), 空 (p.11), 行 (p.14), and 生 (p.26).

`classifyOnKun` returns H2 only when the intended and observed readings are both authoritative rows for the same kanji, are available by the configured school stage, and have opposite `reading_type` values. Same-type alternatives and unknown readings remain `UNCLASSIFIED` rather than being guessed into H2. Kana input is NFC-normalized and katakana/hiragana-equivalent for matching.

Five contrastive pairs (ten sentence halves) passed deterministic classification in both directions: 一 イチ/ひとつ, 角 カク/つの, 空 クウ/そら, 行 コウ/いく, and 生 セイ/なま. Each sentence then passed the v2.4 §7A.7 blind-cloze requirement with 5/5 `gpt-5.5` agreement; raw answers are committed in `h2_blind_cloze_results.json`.

The first behavioural run exposed a verifier-span defect: the prompt requested only the kanji-bearing portion, so 一つ and 行く consistently returned `ひと` and `い`, while the source rows correctly store `ひとつ` and `いく`. The rerun explicitly bracketed the complete source-reading span (`一つ`, `行く`) and all ten cases passed 5/5. No source row or expected reading was loosened to obtain the pass.
