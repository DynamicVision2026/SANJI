# Curriculum data — sources and provenance

Two independent things are tracked here, and they are **not** the same risk
level. Keep them separate in all reporting:

1. **Content verification** — is the character data (grade / kanken / stroke /
   radical) correct? **Yes, done in issue #1.** Cross-verified against the
   official 漢検 2020 degree list and two independent KANJIDIC-derived sources.
2. **File-level provenance** (§6.1 two-source rule) — do we have the official
   MEXT PDF's committed hash and per-row page numbers? **Not yet** — `PENDING` /
   `BLOCKED`. This is a tooling/environment gap (the sandbox has no egress to
   `mext.go.jp`), **not** a data-correctness problem.

> A fabricated hash or guessed page number is worse than an honest gap: it
> creates a false provenance record. **Never** write a placeholder value into a
> `sha256` or `source_page` field. Use the explicit `PENDING` / `BLOCKED`
> markers below until real values exist. Text-extraction-order page *guesses*
> are explicitly disallowed — use the official document's printed footer page
> numbers, obtained via the fetch workflow.

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

**Note on the dataset checksum.** `kanji_teach_grade.checksum.json` holds a real
SHA-256 — but it is a checksum **over our own frozen character set** (the §6.5
substitution guard), *not* the official MEXT PDF's file hash. Do not confuse the
two. The MEXT file hash is tracked as `PENDING` in §2 below.

---

## 2. File-level provenance (§6.1 two-source rule) — PENDING / BLOCKED

§6.1 requires the official MEXT PDFs as the frozen, legally authoritative source,
cross-verification against official **page numbers**, a recorded **source page
number** per row, and a **committed PDF file hash**. The sandbox has no network
egress to `mext.go.jp`, so these file-level artifacts cannot be produced here.

Remediation is automated: run `.github/workflows/fetch-mext-source-and-hash.yml`
(a `workflow_dispatch` action) on GitHub's hosted runner, which has normal
egress. It downloads the official PDF, computes the real SHA-256, and extracts a
per-page text map. Backfill the records below from its artifacts. See
`sources_provenance.yml` for the machine-readable manifest of these records.

```yaml
source_record:
  dataset: kanji_teach_grade
  official_document: 学年別漢字配当表 （平成29年3月告示、令和2年度改定）
  official_url:               # confirmed MEXT URL — supplied to the fetch workflow at dispatch
  content_verification:
    method: cross_check_against_kankentest_2020_degree_list_and_two_independent_kanjidic_sources
    status: content_confirmed_matching_internal_dataset   # done in #1
    verified_at: 2026-08-15
  file_hash:
    sha256: PENDING
    status: BLOCKED_sandbox_no_network_egress
    remediation: see .github/workflows/fetch-mext-source-and-hash.yml
  page_reference:
    status: PENDING_pdf_page_mapping
    note: >-
      requires binary PDF download; text-extraction-order page guesses are
      explicitly disallowed. Use the document's printed footer page numbers
      (observed range ~1-51, with 附表1/附表2 appendices ~pages 50-51).
```

### Template for §19.2 sources (not urgent — empty scaffolds today)

`kanji_reading_stage` and `lexical_reading_rule` are empty scaffolds pending
founder-owned source extraction (§19.2). When that data lands, add a
`source_record` per the same pattern. Their tables already carry a `source_page`
column (§6.2) — every ingested row MUST record its printed page number; leave
rows unwritten rather than guessing.

```yaml
source_record:
  dataset: kanji_reading_stage            # and: lexical_reading_rule
  official_document: 音訓の小・中・高等学校段階別割り振り表 （平成29年3月）
  official_url:
  content_verification:
    status: PENDING_founder_source_extraction   # §19.2
  file_hash:
    sha256: PENDING
    status: BLOCKED_awaiting_source
  page_reference:
    status: PENDING_pdf_page_mapping
```
