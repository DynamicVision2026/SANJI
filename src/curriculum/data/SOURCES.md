# Curriculum data — sources and provenance

Two independent things are tracked here, and they are **not** the same risk
level. Keep them separate in all reporting:

1. **Content verification** — is the character data (grade / kanken / stroke /
   radical) correct? **Yes, done in issue #1.** Cross-verified against the
   official 漢検 2020 degree list and two independent KANJIDIC-derived sources.
2. **File-level provenance** (§6.1 two-source rule) — do we have the official
   MEXT PDF's committed hash and page numbers? **Yes, now CONFIRMED (issue #2)**
   via a manual binary download + human visual page check. Real SHA-256 values
   and printed page numbers are recorded below and in the authoritative
   machine-readable manifest at the repo root: **`sources_provenance.json`** /
   **`sources_provenance.yaml`**.

> A fabricated hash or guessed page number would be worse than an honest gap: it
> creates a false provenance record. The hashes below were computed from the
> **actual downloaded binary files** (not text/summary-derived), and the page
> numbers are the document's **printed footer page numbers** confirmed by a
> human. Earlier `PENDING`/`BLOCKED` markers have been replaced with these
> confirmed values.

---

## 1. Content verification (DONE — issue #1)

`kanji_teach_grade.json` — all **1,026** characters of the MEXT 学年別漢字配当表
(平成29年3月告示, 令和2年度 / 2020 改定), with `teach_grade` (1–6),
`kanken_level` (§6.6), `stroke_count`, and `radical` (康熙 214, CJK-normalised).

Per-grade counts: **80 / 160 / 200 / 202 / 193 / 191 = 1,026** — matches §6.5.

| Field | Content source | Reachable from build env? |
|---|---|---|
| `teach_grade` (incl. 2020 revision) | 漢検 公式 級別漢字表 (2020-02-17), which follows the MEXT 学年別漢字配当表. 10級=小1 … 5級=小6 (§6.6). | via a public dataset (npm/raw GitHub) |
| `stroke_count` | KANJIDIC (`kanji-data`, KANJIDIC2-derived) | yes (npm) |
| `radical` (康熙 214) | Unihan kRSKangXi (`@marmooo/kanji`), NFKC-normalised | yes (npm) |

**Cross-verification.** Two independent transcriptions of the pre-2017 list
(1,006 chars) agree **exactly** per grade (KANJIDIC via `kanji-data`; Wikipedia
via `kyoiku-kanji`). Grades 1–3 are identical across all three sources. The 2020
list differs by a fully explicit, arithmetic-checked 2017 revision:

- **+20** newly added 都道府県 kanji, all to Grade 4:
  茨 媛 岡 潟 岐 熊 香 佐 埼 崎 滋 鹿 縄 井 沖 栃 奈 梨 阪 阜
- **Grade 5/6 → Grade 4** (5): 賀 群 徳 富 城
- **Grade 4 → Grade 5** (21): 囲 紀 喜 救 型 航 告 殺 士 史 象 賞 貯 停 堂 得 毒 費 粉 脈 歴
- **Grade 4 → Grade 6** (2): 胃 腸
- **Grade 5 → Grade 6** (9): 恩 券 承 舌 銭 退 敵 俵 預

Arithmetic (matches §6.5 targets exactly): G4 200+20+5−21−2 = **202**;
G5 185+21−4−9 = **193**; G6 181+2+9−1 = **191**.

The revision character list was additionally confirmed against a **150 dpi PNG
render of the official PDF's pages 44–47** (those pages have no extractable text
layer — the kanji are vector glyphs — so a human verified them visually).

**Note on the dataset checksum.** `kanji_teach_grade.checksum.json` holds a real
SHA-256 — but it is a checksum **over our own frozen character set** (the §6.5
substitution guard), *not* the official MEXT PDF's file hash. Do not confuse the
two. The MEXT file hashes are in §2 below.

---

## 2. File-level provenance (§6.1 two-source rule) — CONFIRMED

Obtained by a manual, external binary download + human verification (issue #2).
Authoritative machine-readable record: `sources_provenance.json` /
`sources_provenance.yaml` at the repo root. Summary:

### `kanji_teach_grade`

- **Official document:** 小学校学習指導要領（平成29年告示）別表　学年別漢字配当表
- **Publication:** 平成29年3月31日, 文部科学省告示第六十三号
- **Landing page:** https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm
- **PDF used:** https://www.mext.go.jp/content/20230120-mxt_kyoiku02-100002604_01.pdf
- **File size:** 5,838,238 bytes
- **SHA-256 (CONFIRMED, from the downloaded binary):**
  `6af90f134b243e44f9767c37ee3079fac092883fd6359b836a5733dd25b43902`
- **Printed page numbers (別表 学年別漢字配当表):**

  | Grade | List | Printed page |
  |---|---|---|
  | — | 別表 heading / start | 44 |
  | 1 | 80 chars | 44 |
  | 2 | 160 chars | 44 |
  | 3 | 200 chars | 45 |
  | 4 | 202 chars (spans pages) | 45–46 |
  | 5 | 193 chars | 46 |
  | 6 | 191 chars (spans pages) | 46–47 |

- **Verification method:** binary downloaded via curl; pymupdf/pdfplumber used to
  locate the 国語 section and the 告示 signature; pages 44–47 (the table body)
  have a 0-character text layer (vector glyphs), so they were rendered to PNG at
  150 dpi and **verified page-by-page by a human**.

> The §6.2 `kanji_teach_grade` schema has no per-row `source_page` column, so the
> page mapping is recorded at source-record granularity here and in the root
> manifest — not per row.

### `kanji_reading_stage` / `lexical_reading_rule` source (音訓割り振り表)

**§19.2 remains open** — this delivery covers the MEXT 音訓割り振り表's own
appendix scope (jukujikun + proper-noun exceptions) only. Curated 連濁
(rendaku) rules are a separate, still-undelivered data source (§6.1); closing
§19.2 is a coordinator decision, not the implementing role's call (§0.1).
`kanji_reading_stage.json` holds 4,388 rows (all 2,136 常用 characters,
on/kun readings across elementary/junior_high/high_school).
`lexical_reading_rule.json` holds 135 rows: 123 from 付表1 (jukujikun
whole-word exceptions) + 12 from 付表2 (都道府県名 proper-noun readings).
Every row carries a per-row `source_page` (printed page number, per §6.1's
per-row granularity for this source), an extraction `confidence`
(`high`/`medium`), and `extraction_notes` where applicable — see `qa_flags`
in the delivered extraction for the one `medium`-confidence case (叱, page
19: the glyph has no Unicode text mapping and was recovered by visual
verification).

`reading_variants.json` is a separate, versioned §6.7 asset for valid
whole-surface readings absent from the frozen appendix extraction. It does not
reshape or silently amend `lexical_reading_rule`. Each entry has a stable
order-independent `variant_id`, an explicit provenance reference, and named
verification before `frozen` use. Snapshot 1.0.0 contains only 明日/あした,
authorized by the architect ruling recorded in Issue #23; `source_page` is
null so it cannot be mistaken for a reading printed in either official PDF.

Ingestion required one schema addition beyond the original §6.2 design: a new
`kanji_jouyou` table (the full 2,136-character 常用 superset) that
`kanji_reading_stage.kanji` now FKs against, because the source covers
~1,110 characters that are jōyō but never appear in `kanji_teach_grade`
(taught only from junior high onward). See
`db/migrations/0008_reading_stage_lexical_ingestion.sql`.

- **Official document:** 音訓の小・中・高等学校段階別割り振り表（平成29年3月）
- **Landing page:** https://www.mext.go.jp/a_menu/shotou/new-cs/1385768.htm
- **PDF used:** https://www.mext.go.jp/a_menu/shotou/new-cs/__icsFiles/afieldfile/2017/05/15/1385768.pdf
- **File size:** 984,020 bytes
- **SHA-256 (CONFIRMED, from the downloaded binary):**
  `0bc189982a50122f1e35dd6a751bfdff0ec5a0ad67e99eda916d012f859a5ae4`
- **Printed page numbers:** 説明/備考 p.1; 音訓表 body p.2–50; 付表1 p.51;
  付表2 (都道府県名) p.52. Full text layer (no OCR needed).

---

## On the `fetch-mext-source-and-hash.yml` workflow

Status updated for spec v2.3 (§6.5, §6.1.1). The workflow has two jobs with
different standing:

- **`verify-committed-hashes` — REQUIRED (v2.3 §6.5 MUST).** Runs automatically
  on any change to curriculum data (and on PRs touching it): re-downloads each
  CONFIRMED source PDF from its recorded URL, recomputes SHA-256, and fails on
  mismatch with the committed hash. This is the check §6.1.1 explicitly did
  **not** waive — it detects republication or substitution of the source
  document. CI also asserts this manifest's shape (present, well-formed,
  grade blocks 1–6 covered, named verifier) in `scripts/check-curriculum.mjs`.
- **`fetch` (workflow_dispatch) — acquisition utility.** For future §6.1
  sources: downloads an official PDF and produces hash + page-map artifacts for
  maintainer backfill. The original acquisition for `kanji_teach_grade` was
  performed manually (issue #2) under the recorded waiver in v2.3 §6.1.1 —
  the page map is a committed artifact with a named verifier, and only the
  *automated page-map extraction* was waived, not hash verification.
