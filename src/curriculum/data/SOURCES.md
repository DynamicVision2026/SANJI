# Curriculum data — sources and provenance

This documents how `kanji_teach_grade.json` was produced and its verification
status against the **two-source acquisition rule (§6.1, MUST)**. Read this
before treating the data as legally authoritative.

## What is ingested

`kanji_teach_grade.json` — all **1,026** characters of the MEXT 学年別漢字配当表
(2017 告示, 令和2年度 / 2020 実施), with `teach_grade` (1–6), `kanken_level`
(§6.6), `stroke_count`, and `radical` (康熙 214, CJK-normalised). Frozen checksum
and per-grade counts are in `kanji_teach_grade.checksum.json`.

Per-grade counts: **80 / 160 / 200 / 202 / 193 / 191 = 1,026** — matches §6.5.

## Sources of record

| Field | Source | Reachable from build env? |
|---|---|---|
| `teach_grade` (grades 1–6, incl. 2020 revision) | 漢検 公式 級別漢字表 (2020-02-17): `outline_degree_national_list20200217.pdf`, which follows the MEXT 学年別漢字配当表. 10級=小1 … 5級=小6 (§6.6). | Transcribed via a public dataset (see below); the 漢検/MEXT PDFs themselves are **not** reachable from CI egress. |
| `stroke_count` | KANJIDIC (via `kanji-data`, KANJIDIC2-derived) | yes (npm) |
| `radical` (康熙 214) | Unihan kRSKangXi (via `@marmooo/kanji` UnicodeRadical), NFKC-normalised to CJK form | yes (npm / raw GitHub) |

### 2020 revision cross-verification (what we could verify here)

Two independent transcriptions of the **pre-2017** list (1,006 chars) were
pulled and found to agree **exactly**, per grade:

- KANJIDIC grades (`kanji-data` npm package)
- Wikipedia "Kyōiku kanji" list (`kyoiku-kanji` npm package)

Against that verified pre-2017 baseline, the 2020 list used here differs by a
**fully explicit, arithmetic-checked 2017 revision**:

- **+20** newly added 都道府県 kanji, all to Grade 4:
  茨 媛 岡 潟 岐 熊 香 佐 埼 崎 滋 鹿 縄 井 沖 栃 奈 梨 阪 阜
- **Grade 5/6 → Grade 4** (5): 賀 群 徳 富 城
- **Grade 4 → Grade 5** (21): 囲 紀 喜 救 型 航 告 殺 士 史 象 賞 貯 停 堂 得 毒 費 粉 脈 歴
- **Grade 4 → Grade 6** (2): 胃 腸
- **Grade 5 → Grade 6** (9): 恩 券 承 舌 銭 退 敵 俵 預

Arithmetic (matches §6.5 targets exactly):
- G4: 200 + 20 + 5 − 21 − 2 = **202**
- G5: 185 + 21 − 4 − 9 = **193**
- G6: 181 + 2 + 9 − 1 = **191**

Grades 1–3 are **identical** across all three sources (unchanged by the 2017
revision).

## ⚠️ Outstanding obligation under the two-source rule (§6.1) — founder-owned

§6.1 requires that the official MEXT PDFs are the frozen, legally authoritative
source, that third-party transcriptions be **cross-verified against official PDF
page numbers**, and that **every ingested row record its source page number**
plus a **committed PDF file hash**.

This build environment has **no network egress to mext.go.jp or kanken.or.jp**
(only package registries and raw GitHub are reachable), so that final
cross-check could not be performed here. Consequently:

- The `teach_grade` values are transcribed from a 漢検-official list that mirrors
  the MEXT table, and cross-checked against two independent pre-2017
  transcriptions plus the explicit revision delta above — but **not** yet
  page-verified against the official MEXT PDF.
- **Page numbers and the committed MEXT PDF hash are NOT yet recorded.** The
  §6.2 `kanji_teach_grade` schema has no `source_page` column (unlike the
  reading/lexical tables), so page provenance is tracked here rather than
  per-row; it must be completed when the official PDF is obtained.

**Action required (founder / §19.2 owner):** obtain the official MEXT
学年別漢字配当表 PDF, commit its file hash, and confirm the grade assignments
against it. Until then, treat this dataset as *validated for structure and
internally consistent* but *pending final authoritative page-verification*.

This gap is called out in the PR description as an issue-vs-spec tension: the
issue treats the character table as "Complete, validated" (§6.1) and expects
full ingestion this week, while the §6.1 two-source MUST cannot be fully
satisfied from the sandbox. Per CLAUDE.md, the spec wins and the conflict is
flagged rather than silently resolved.
