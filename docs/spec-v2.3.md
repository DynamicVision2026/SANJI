# V1 Engineering Specification — Unified
**Product:** Kanji diagnostic and parent-reporting layer for 個別指導塾 (working name: SENJI)
**Document version:** 2.3 — draft
**Repository:** `DynamicVision2026/SANJI`
**Supersedes:** Product spec R1, R2; Engineering spec 1.0, 2.0, 2.1, 2.2. **This is the single source of truth.**
**Audience:** Development team
### Changes from 2.2
- **§0.1** New governance rule: acceptance criteria may not be downgraded or waived by the implementing role
- **§6.1** Provenance granularity now matches source-document organisation — block-level for 学年別漢字配当表, per-row for reading and lexical tables. Machine-readable manifest required
- **§6.1.1** New: recorded waiver of automated page-map extraction, with technical rationale
- **§6.5** CI gains PDF hash verification workflow and manifest assertion
- **§5.1** `organizations` gains `ruby_policy`
- **§7.5** Disambiguation before freeze: ✓ marks in the `target` row denote tier acceptability, not ruby application. Ruby never renders on a target span at any tier
- **§7.10** `ruby_policy` added to runtime configuration
- **§9.2** Placeholder-font provision — rendering work proceeds before the licensed file arrives
- **§9.6** `reason: recommended` spans now render conditionally per `ruby_policy`; unconditional application removed
- **§18** Milestone table split into engineering deliverables and externally-owned dependencies
- **§19.1** Reclassified: **blocks launch, not Sprint 3.** Week 3 escalation trigger added
- **§19.5** Ruby grade-boundary default added as a pilot-validatable input
- **§21** DoD gains removal of the placeholder font
---
## 0. How to read this document
Sections 1–4 are context. Sections 5–17 are binding implementation requirements. Section 15 defines the automated gates. Section 21 defines done. Section 19 lists items not yet closed.
Requirement keywords: **MUST** = V1 blocking. **SHOULD** = build if it does not delay launch. **WON'T** = explicitly out of scope, do not build.
Every section is written to be self-contained. If a section appears to contradict another, that is a defect — report it rather than choosing an interpretation.
### 0.1 Governance of acceptance criteria
**Acceptance criteria may not be downgraded, waived, or reclassified by the implementing role.** Where a criterion appears unachievable or inappropriate, it is raised for decision and the resolution is recorded in this document. **An unrecorded waiver is a defect independent of the outcome it produced** — a correct result reached by unilaterally relaxing a stated requirement is still a process failure, because the next such decision may not be correct and nothing in the record would distinguish them.
Recorded waivers to date: §6.1.1.
---
## 1. Product summary
A B2B SaaS system sold to private tutoring schools (juku) in Japan as a **student-retention tool**.
**Why this exists.** 個別指導塾 sell individualized instruction as their core promise to parents. That promise has a structural limit: genuine personalization — diagnosing each student's specific gaps and producing material targeted to them — requires instructor time that does not scale with enrollment. Beyond a certain student count, instructors default to generic worksheets, and the juku's core promise quietly erodes. SENJI exists to remove that limit. LLM-driven generation and diagnosis substitutes for the labor that true 1:1 personalization would otherwise require, so a juku can keep every student's practice individually targeted regardless of how many students it serves. **AI is not the feature being sold; it is the mechanism that keeps the juku's promise intact at scale.**
**Competitive positioning — downstream of the above, and binding on design.** SENJI is a **diagnostic and parent-reporting layer that sits on top of whatever practice material a juku already uses.** The market is not empty: incumbent question banks such as eトレ already provide large static libraries covering kanji reading, writing, radicals, okurigana, and homophone distinction. SENJI does not compete with those on library size. It competes on the axis established above — per-student targeting that a static library cannot produce and an instructor cannot sustain manually.
The customer-facing claim is: *"Keep using your existing materials. SENJI turns the results into a diagnosis and a parent-readable report."*
**That claim imposes a hard architectural requirement.** The system MUST be able to build a complete error profile for a student who never uses a SENJI-generated worksheet (§11.4). Any design in which error data can only originate from SENJI's own worksheets makes the sales claim false and is rejected.
The commercial driver is enrollment pressure from 少子化. **The parent report is the product being sold. The generation engine is infrastructure that feeds it.** Every prioritisation conflict resolves in favour of the report.
### 1.1 Standing design check
The rationale in §1 is not background. It is the standard against which downstream decisions are evaluated, by all roles:
- **Engineering.** A feature or shortcut that reduces per-student targeting is not a minor tradeoff — it removes the reason the product exists. Falling back to templated content too readily, or letting corpus reuse dilute how targeted a worksheet feels, are the two concrete forms this takes. Both are bounded and instrumented in §7.7, §7.8, §13, and §15.6 precisely so that the degradation is visible rather than gradual.
- **Architecture.** The error-profile pipeline (§5.2), the tiered reading classifier (§7.4), and the manual-entry path (§11.4) are not data plumbing. They are what makes "individualized at scale" literally true rather than aspirational. Any redesign of these is evaluated against whether it preserves genuine per-student targeting.
- **Coordination.** Pilot feedback and business-validation findings (§19.5) are weighted by whether they affect the juku's ability to deliver individualization at scale. Pricing and packaging findings are secondary to that.
**A note on the tension this creates with §7.8.** Corpus reuse is a margin lever and, at target hit rates, most sentences a student sees will be reused text. This is not a violation of the principle above, and §7.8 states why: personalization resides in *selection* — which kanji and which readings, drawn from this student's error profile — not in the novelty of every sentence. The constraint that does follow is a limit on visible overlap between students taught together. Do not resolve this tension by weakening either side informally; §7.8 is the agreed resolution.
---
## 2. Glossary
| Term | Meaning |
|---|---|
| 塾 (juku) | Private tutoring school |
| 個別指導塾 | Individual/small-group tutoring school (1:1 to 1:3). Primary customer |
| 教室 | A branch/classroom location |
| 塾長 / 教室長 | Branch manager. Usually the buyer |
| 講師 | Instructor. Often a part-time university student; high turnover |
| 退塾 | Student withdrawal. The churn the product prevents |
| eトレ | Incumbent static question-bank system widely deployed in juku. SENJI layers on top of it, not against it |
| 漢検 | Kanji Kentei certification. 級 levels run 10級 (easiest) upward |
| 学年別漢字配当表 | MEXT table assigning 1,026 kanji to grades 1–6 |
| 音訓割り振り表 | MEXT table assigning individual readings to school stages. Distinct from the above |
| 熟語 | Multi-kanji compound word |
| 熟字訓 | Whole-word reading not derivable from constituent characters (今日 = きょう) |
| 付表の語 | Appendix words in the 常用漢字表 with irregular readings |
| 連濁 | Rendaku — voicing shift in compounds (手 + 紙 → てがみ) |
| 既習漢字 | Kanji the student has already been taught |
| ふりがな / ruby | Reading annotation printed above (or beside) a character |
| 教科書体 | Textbook typeface. Required for handwriting instruction |
| 禁則処理 | Japanese line-breaking prohibition rules |
| 異体字 | Variant character forms, common in proper nouns (髙, 﨑, 濵) |
| 縦書き / 横書き | Vertical / horizontal writing orientation |
| Span | A character range within generated text, carrying a role and a tier |
| Tier | One of six reading-difficulty classifications assigned to a span (§7.4) |
| 電話代行 | Outsourced Japanese telephone answering service. Triage only (§11.8) |
| Chatwork | Japan-domestic business messaging tool. Primary human support channel (§11.8) |
| Targeting fidelity | Proportion of worksheet items mapping to the student's recorded weak points (§13, §15.6) |
| Placeholder font | Interim single-weight CJK font used for build and gate verification before the licensed 教科書体 arrives (§9.2) |
---
## 3. Roles and permissions
| Capability | オーナー | 教室長 | 講師 |
|---|---|---|---|
| Billing, plan changes | ✓ | — | — |
| Create/delete 教室 | ✓ | — | — |
| Invite/deactivate users | ✓ | ✓ (own 教室) | — |
| Upload branding | ✓ | ✓ (own 教室) | — |
| Set `ruby_policy` | ✓ | — | — |
| Roster CRUD | ✓ | ✓ (own 教室) | — |
| Assign students to instructors | ✓ | ✓ (own 教室) | — |
| Generate/grade worksheets | ✓ | ✓ (own 教室) | ✓ (assigned only) |
| Manual error entry | ✓ | ✓ (own 教室) | ✓ (assigned only) |
| Generate/export reports | ✓ | ✓ (own 教室) | ✓ (assigned only) |
| View error-capture dashboard | ✓ (all) | ✓ (own 教室) | ✓ (own students) |
| Access review queue | ✓ | — | — |
**Scoping rule (MUST):** instructors are scoped to **assigned students**, not to branches. In 個別指導 the 1:2 or 1:3 pairing is the unit of work.
**Ownership rule (MUST):** student data, error profiles, and reports belong to the **教室**, never to a user account. Deactivating an instructor MUST NOT affect any student record. Instructor turnover is annual and expected.
---
## 4. Account hierarchy
```
organizations (法人・事業者)   — billing, plan tier, default branding, corporate_number, ruby_policy
  └── branches (教室)          — roster, report branding, seat counting
        └── students (生徒)    — error profile, 漢検 target, reports
users attach at org level, scoped to branches via user_branch_assignments
```
- **WON'T:** a fourth level for franchise 本部. Not the buyer in V1.
- **MUST:** unlimited user accounts at every tier. Billing is by student count only — never per instructor.
- **MUST:** support moving a student between branches within an org, carrying the full error profile and report history.
---
## 5. Data model
Postgres. All tenant tables carry `org_id` and are protected by row-level security (§16.1). **Every tenant table, including join and assignment tables, without exception.**
### 5.1 Tenancy and identity
```
organizations
  id uuid pk, name text,
  corporate_number text,          -- 法人番号; fair-use is keyed on this, not org_id
  address text,
  plan_tier enum(pilot,standard,growth,multisite), student_cap int,
  billing_status enum, default_logo_url text,
  ruby_policy enum(conservative, always, minimal) default 'conservative',  -- ★ §9.6
  created_at timestamptz
branches
  id uuid pk, org_id fk, name text,
  report_display_name text,      -- name printed on parent reports
  logo_url text nullable,        -- falls back to org default
  address text, created_at timestamptz
users
  id uuid pk, org_id fk, email citext unique, password_hash text,
  role enum(owner, manager, instructor),
  status enum(active, invited, deactivated),
  last_login_at timestamptz, created_at timestamptz
user_branch_assignments           -- RLS required (§16.1)
  user_id fk, branch_id fk, org_id fk, primary key (user_id, branch_id)
students
  id uuid pk, branch_id fk, org_id fk, display_name text,
  grade smallint,                       -- 1..6
  kanken_target_level smallint nullable,
  kanken_target_date date nullable,
  status enum(active, withdrawn), enrolled_at date, created_at timestamptz
student_instructor_assignments    -- RLS required (§16.1)
  student_id fk, user_id fk, org_id fk, active bool,
  primary key (student_id, user_id)
```
### 5.2 Content and results
```
items
  id uuid pk, item_type enum(kakitori, yomi, jukugo, homophone, diagnostic),
  target_kanji char, target_reading_id fk,
  body_text text,               -- sentence with blank marker
  answer_text text, blank_position int,
  grade smallint, kanken_level smallint,
  max_tier enum,                -- highest tier present in any carrier span (§7.8)
  reading_analysis jsonb,       -- per-span tiers with character offsets (§7.4)
  render_plan jsonb,            -- ruby placement derived from reading_analysis (§7.6)
  validation_status enum(passed, failed, manual_review),
  validation_report jsonb,
  source enum(generated, corpus, manual),
  model_used text, usage_count int default 0,
  created_at timestamptz
  INDEX (target_kanji, target_reading_id, item_type, grade, max_tier, validation_status)
worksheets
  id uuid pk, student_id fk, branch_id fk, org_id fk,
  created_by_user_id fk, sheet_type enum, item_count smallint,
  targeting_fidelity numeric,     -- §13
  relaxation_events jsonb,        -- §7.7
  status enum(generated, graded, discarded),
  generated_at timestamptz, graded_at timestamptz nullable
worksheet_items
  worksheet_id fk, item_id fk, position int
results
  id uuid pk, worksheet_id fk, item_id fk, student_id fk,
  is_correct bool, wrong_answer_text text nullable,
  graded_at timestamptz, graded_by_user_id fk
manual_error_entries              -- error data from material SENJI did not generate
  id uuid pk, student_id fk, org_id fk,
  kanji char, reading_id fk nullable,
  error_kind enum(reading, writing, jukugo, unknown),
  source_label text,              -- free text, e.g. 'eトレ', '学校テスト'
  observed_at date, entered_by_user_id fk, created_at timestamptz
error_profile                     -- materialized view over results ∪ manual_error_entries
  student_id, kanji, reading_id, attempts int, correct int,
  mastery_score numeric, last_seen_at timestamptz,
  provenance jsonb                -- counts by source, for §10.3
  primary key (student_id, kanji, reading_id)
diagnostics
  id uuid pk, student_id fk, administered_at timestamptz,
  cadence enum(initial, recurring),
  estimated_grade_level numeric, estimated_kanken_level smallint,
  report_id fk nullable
reports
  id uuid pk, student_id fk, branch_id fk,
  report_type enum(diagnostic, monthly), period text,   -- 'YYYY-MM'
  content jsonb, comment_text text, comment_edited_by fk nullable,
  pdf_object_key text, generated_at timestamptz, exported_at timestamptz
review_queue                      -- REVIEW_REQUIRED items, async (§7.7)
  id uuid pk, item_id fk nullable, request_payload jsonb,
  reason text, status enum(open, resolved, discarded),
  created_at timestamptz, resolved_by fk nullable
subscriptions
  org_id fk, tier enum(pilot,standard,growth,multisite),
  student_cap int, price_jpy int,
  billing_cycle enum(monthly, annual), renewal_date date, status enum,
  setup_fee_jpy int default 0,
  trial_ends_at timestamptz nullable,
  discount_pct numeric nullable,
  discount_ends_at timestamptz nullable
audit_log
  id, org_id, user_id, action, entity_type, entity_id, metadata jsonb, at
```
---
## 6. Curriculum data layer
Global reference data, not tenant-scoped. Maintained as a versioned asset in the repository with migration history.
### 6.1 Sources of record and provenance
| Level | Source | Status |
|---|---|---|
| Character grade | MEXT 学年別漢字配当表 (2017) | Complete, validated |
| Reading stage | MEXT 音訓の小・中・高等学校段階別割り振り表 (March 2017) | In progress (§19.2) |
| Lexical exceptions | 常用漢字表 付表, plus curated 熟字訓 / 連濁 / proper-noun rules | In progress (§19.2) |
**Two-source acquisition rule (MUST).** The official MEXT PDFs are the frozen, legally authoritative source of record. Third-party HTML transcriptions may be used to accelerate extraction but MUST be cross-verified against official PDF page numbers before ingestion.
**Provenance granularity (MUST).** Granularity matches the source document's own organisation:
- **Block-level** where the source lists entries in grade blocks — 学年別漢字配当表. Page attribution is recorded per grade range in a committed, machine-readable provenance manifest (JSON or YAML in the repository, not prose). `kanji_teach_grade` carries no per-row `source_page` column, by design.
- **Per-row** where the source is organised per entry — 音訓割り振り表, 付表. `source_page` is mandatory on `kanji_reading_stage` and `lexical_reading_rule`.
The rationale for the asymmetry, stated so it is not mistaken for a relaxation: for a frozen 1,026-row character set, the §6.5 checksum is a **stronger** control than page numbers. Page provenance answers *"where did this come from?"*; the checksum answers *"has this changed?"* For a table that should never change again, the second question is the operative one. The reading and lexical tables are dense, entries are scattered, and disputes there will concern a single reading — so per-row attribution is load-bearing and is retained.
In all cases, the source PDF's SHA-256 is committed alongside the extracted data, and the manifest references that hash.
### 6.1.1 Recorded waiver — automated page-map extraction
**Waived:** the requirement that the provenance page map be produced automatically by a CI pipeline.
**Technical rationale:** pages 44–47 of the source PDF are vector-rendered glyphs with no extractable text layer. Automated text extraction and OCR cannot reliably produce the page map from this source. The requirement was written on an assumption about the document that does not hold.
**What replaces it:**
- The page map is a committed artifact with a named human verifier and a verification date
- CI asserts the artifact exists, is well-formed, and references the committed PDF hash
- **The hash verification itself is NOT waived and MUST be automated** (§6.5). That is the check with real protective value — it detects republication of the source document or substitution of the file
**Recorded per §0.1** because the original criterion was initially reclassified by the implementing role rather than raised. The outcome was correct; the process was not.
### 6.2 Schema — three levels
```
kanji_teach_grade                 -- character level; provenance is block-level (§6.1)
  kanji char pk, teach_grade smallint,   -- 1..6
  kanken_level smallint, stroke_count smallint, radical text
kanji_reading_stage               -- reading level
  id serial pk, kanji fk, reading_kana text,
  reading_type enum(on, kun),
  school_stage enum(elementary, junior_high, high_school),
  elementary_grade smallint nullable,     -- only when school_stage=elementary
  source_page int NOT NULL, is_jukujikun bool default false
lexical_reading_rule              -- lexical exception level
  id serial pk, surface text, reading_kana text,
  rule_kind enum(jukujikun, rendaku, proper_noun, furoku),
  min_stage enum, min_elementary_grade smallint nullable,
  source_page int NOT NULL
```
### 6.3 Character grade is not a proxy for reading grade
**Central principle of the curriculum layer, binding everywhere downstream.** The same character can carry readings assigned to different school stages. 宮 is a Grade 3 character, but its reading グウ is not taught until junior high. Any logic that infers reading appropriateness from `kanji_teach_grade` is incorrect and MUST be rejected in review.
### 6.4 Resolution order (MUST)
Lexical rules resolve **before** morphological analysis, not after. A morphological analyser will return a plausible character-by-character reading for 今日 and thereby miss that it is a fixed whole-word reading. Order:
1. `lexical_reading_rule` whole-surface match
2. `kanji_teach_grade` character check
3. `kanji_reading_stage` reading check
4. Lexical difficulty heuristics
The highest risk tier produced by any step wins.
### 6.5 CI coverage (MUST)
- Per-grade count assertions: 80 / 160 / 200 / 202 / 193 / 191, total 1,026
- Duplicate detection
- **Checksum assertion over the frozen sorted character set.** Counts alone do not detect substitution — swapping one Grade 6 character for another preserves the count. The 激 omission found during validation is precisely this class of defect
- **Provenance manifest assertion:** manifest is present, well-formed, covers every grade block, and references the committed PDF hash
- **PDF hash verification workflow (MUST be automated):** a `workflow_dispatch` job — also triggered on any change to curriculum data — fetches the source PDF, computes SHA-256, and fails on mismatch with the committed hash
---
## 7. Generation and validation pipeline
The technical core. **No item may reach a student without passing §7.7's gate.**
### 7.1 Governing philosophy
Two principles govern this pipeline. Both are binding; neither may be traded against the other informally.
**(a) Reading stage is a guideline, not an error dictionary.** MEXT's reading tables describe educational staging. An above-grade character or reading is usable in student-facing material when paired with ruby annotation; it is not automatically an error. The pipeline does not answer "is this text legal?" but "under what rendering conditions is this text appropriate for this student?" Implemented in §7.2, §7.4, §7.5, §7.6. Any part of the system that reduces this to a single whitelist contradicts the product and is a defect.
**(b) Targeting fidelity is the product's reason to exist (§1.1).** Every worksheet must be demonstrably built from *this* student's error profile. Degradation paths — corpus reuse, target relaxation, templated fallback — are permitted but MUST be bounded, logged, and measurable. Implemented in §7.7, §7.8, §13, §15.6. A degradation that is silent is a defect even if it is rare.
### 7.2 Character sets — L2
L2 is deterministic set membership over three categories, evaluated first because it is free and fully reliable.
| Set | Contents | Effect |
|---|---|---|
| `allowed_bare` | The student's 既習 characters, plus hiragana, katakana, ASCII digits, 、。「」！？, 々, ー | Usable without ruby |
| `allowed_with_ruby` | A broader configured set (default: all 1,026 kyōiku kanji, plus configured 常用 extensions) | Usable **only if** RenderPlan assigns ruby to the span |
| reject | Everything else | Hard reject, no regeneration feedback needed |
`allowed_bare` and `allowed_with_ruby` are disjoint at evaluation time: a character in the student's 既習 set is never forced into ruby.
### 7.3 Request contract
```
GenerationRequest {
  grade: int
  kanken_level: int
  allowed_bare: char[]           // 既習 set for THIS student
  allowed_with_ruby: char[]      // broader permitted set
  target_kanji: char
  target_reading_id: int
  item_type: enum
  span_role_profile: enum        // see §7.5
  topic_hint: string             // neutral, non-identifying
  exclude_item_ids: uuid[]
  cohort_exclude_item_ids: uuid[] // §7.8 cohort diversity
}
```
**MUST:** contains **no student identifier, name, age, branch, or organisation.** Enforced by §15.2.
### 7.4 Reading analysis — L3
L3 produces a **per-span classification with character offsets**, not a per-item verdict. Per-item classification is insufficient because ruby placement requires knowing *which* span is difficult.
| Tier | Meaning |
|---|---|
| `PASS` | Within the student's stage; no annotation needed |
| `RUBY_RECOMMENDED` | Marginal; ruby improves accessibility. **Whether ruby actually renders is decided at render time by §9.6, not here** |
| `RUBY_REQUIRED` | Above stage; unreadable without ruby. Ruby always renders (§9.6) |
| `REWRITE_RECOMMENDED` | Above stage and awkward to annotate; prefer regeneration |
| `REVIEW_REQUIRED` | Cannot be classified with confidence |
| `EXEMPT` | Outside the classifier's scope (§7.5) |
**Analysis record (stored in `items.reading_analysis`):**
```
[{ start: int, end: int, surface: string, role: enum,
   tier: enum, basis: enum(lexical, character, reading, heuristic),
   source_rule_id: int|null }]
```
**Determinism (MUST).** Tier assignment MUST be reproducible: identical input (morphology output + frozen tables + rules) MUST yield identical tiers on every run. Enforced by §15.5.
**LLM exclusion (MUST).** The LLM is excluded from tier assignment entirely — not as authority, not as tie-breaker, not as fallback for low-confidence cases. Low-confidence spans classify as `REVIEW_REQUIRED`. The LLM may generate candidate text (§7.9 L1) and propose rewrites for `REWRITE_RECOMMENDED` spans; it never assigns a tier.
**Supporting assertions** — evaluated as part of L3 and reported alongside tiers:
- `target_kanji` appears in a token whose in-context reading matches `target_reading_id`
- sentence length within grade band — G1–2: 12–25 chars; G3–4: 18–35; G5–6: 25–50
- for `homophone` items, ≥1 disambiguating content word such that the intended compound is recoverable from context alone
- `target_kanji` occurrence count within configured bounds (default: exactly 1)
### 7.5 Span roles and action policy
**Six roles. Frozen at end of Week 1** (§18) and the contract between the classifier and every consumer.
| Role | Description | PASS | RUBY_REC | RUBY_REQ | REWRITE_REC | REVIEW_REQ |
|---|---|---|---|---|---|---|
| `target` | The span being tested | ✓ | ✓ | **reject** | reject | queue |
| `carrier` | Generated text surrounding the target | ✓ | ✓ | ✓ | regenerate | queue |
| `diagnostic_probe` | Diagnostic items deliberately probing above assumed grade | ✓ | ✓ | ✓ | ✓ | queue |
| `static_chrome` | Fixed instructions, section labels, field names printed on the worksheet | build-time only | build-time only | build-time only | reject | reject |
| `proper_noun` | User-supplied names — branch, student, instructor comment names | **EXEMPT** | — | — | — | — |
| `report_body` | Parent report prose. Adult reader | ✓ | ✓ | ✓ | ✓ | ✓ |
**Reading this table (MUST — clarified before freeze).** A ✓ denotes **that the tier is acceptable for that role**. It does not denote that ruby is applied. Ruby application is decided solely by §9.6 from the persisted RenderPlan.
- **Ruby NEVER renders on a `target` span, at any tier.** §7.6's `suppressed_spans` override is unconditional. The ✓ under `RUBY_RECOMMENDED` for `target` means such an item may ship, not that the answer may be annotated. `RUBY_REQUIRED` on a target is rejected because the span would be unreadable and cannot be annotated
- **`diagnostic_probe` deliberately inverts the grade gate.** The diagnostic exists to locate a student's ceiling; rejecting above-grade content would make the instrument incapable of measuring anything above the grade already assumed. Grade-appropriateness does not gate this role. **Safety (§7.9 L5) and naturalness (§7.9 L4) still apply in full**
- **`static_chrome` is validated once at build time**, not per render, against the lowest supported grade (Grade 1). It is author-controlled static text. `REWRITE_RECOMMENDED` or worse fails the build rather than queueing
- **`proper_noun` is EXEMPT and MUST bypass the classifier entirely.** Proper nouns are a glyph-coverage concern (§9.5), not a reading-stage concern. Running 髙木ゼミナール through the classifier would produce a permanent `REVIEW_REQUIRED` on the customer's own name
- **Instructor UI text never enters the classifier at all.** Outside the pipeline boundary. Any code path routing UI strings into reading analysis is a defect
### 7.6 RenderPlan
L3 output is converted into a rendering instruction consumed by §9.6.
```
RenderPlan {
  ruby_spans: [{ start, end, reading_kana, reason: enum(required, recommended) }]
  suppressed_spans: [{ start, end }]   // target spans; ruby must never render here
}
```
**MUST:** `suppressed_spans` is authoritative and overrides `ruby_spans` on overlap, unconditionally and regardless of tier or policy. A ruby annotation rendered over a `target` span reveals the answer and destroys the item.
**MUST:** `reason` is populated for every entry and preserved verbatim. It is the input §9.6 uses to decide conditional application; a renderer that ignores `reason` is a defect.
RenderPlan is computed once at validation time and persisted on the item. It is not recomputed at render time — a persisted item must render identically forever under a given policy.
### 7.7 Gate and failure handling
The gate is binary by necessity: the pipeline requires a yes/no in order to decide whether to regenerate. The six-tier classification is an **input** to that decision, not a replacement for it.
```
analysis  = classify(item)                      // §7.4, per-span, deterministic
plan      = derive_render_plan(analysis)        // §7.6
decision  = apply_policy(analysis, span_roles)  // §7.5 → PASS | REGENERATE | REVIEW
for attempt in 1..3:
    if decision == PASS:  persist(item, analysis, plan); return item
    if decision == REVIEW: enqueue_review(item); break     // do NOT block
    item = generate(request + rewrite_feedback)
    ...
fallback = corpus_lookup(key, allow_repeat=true)
if fallback: return fallback
drop_item()
```
**`REVIEW_REQUIRED` never blocks live generation (MUST).** It enqueues asynchronously and the live path proceeds to regeneration or corpus fallback.
**Minimum item rule (MUST).** A worksheet MUST NOT be delivered with fewer than **80% of its configured item count**. Below that, regenerate with relaxed target selection (next-weakest kanji).
**Target relaxation is a targeting degradation and MUST NOT be silent (§7.1b).** Every relaxation event is recorded in `worksheets.relaxation_events` with the original target, the substituted target, and the reason. Relaxation rate is instrumented per branch and per student (§13). A sustained rate above the configured ceiling means the generator cannot serve the error profiles it is being given — a product defect, not a tuning issue — and MUST raise an alert rather than degrade quietly.
**Review queue bounds.** Queue depth is instrumented. Sustained depth above a configured ceiling MUST log an alert — a queue growing faster than it is drained means the classifier is miscalibrated, not that reviewers are slow.
### 7.8 Corpus cache — L6, and its relationship to personalization
Every item passing the gate is persisted. **Retrieval key: `(target_kanji, target_reading_id, item_type, grade, max_tier)`.**
`max_tier` is mandatory in the key. Two items sharing the first four components are **not** interchangeable if one is safe bare and the other requires ruby.
**Scope of the corpus, stated explicitly because §1.1 makes it consequential.** The corpus is a **pool of validated content, not a personalization shortcut.** Personalization resides in *selection* — which kanji and which readings are drawn, based on this student's error profile — not in the novelty of every sentence. Two students both failing 果 on the reading はて may legitimately receive the same validated sentence, because the targeting decision happened upstream of retrieval. High corpus hit rates are therefore compatible with high targeting fidelity, and the two are measured separately (§13).
**Cohort diversity constraint (MUST).** The case where reuse *does* damage the product is visible overlap between students taught together — a 1:2 or 1:3 lesson in which two children receive recognisably similar sheets. Therefore:
- `cohort_exclude_item_ids` is populated with items served to other students in the same branch on the same day
- Item overlap between any two worksheets generated for the same branch on the same day MUST NOT exceed a configured threshold (default 20%)
- Where the constraint cannot be satisfied from corpus, fall through to generation rather than relaxing the constraint
**Selection order:** corpus items the student has not seen and that satisfy cohort diversity → generation → corpus with cohort constraint relaxed (logged as a relaxation event) → corpus with repeat allowed.
### 7.9 Remaining layers
- **L1 — Generation.** LLM call with constraints in the prompt. **MUST NOT use logit-level constrained decoding**; Japanese tokenizers do not align to character boundaries and vocabulary masking degrades fluency severely. The architecture is generate → verify → regenerate.
- **L4 — Naturalness.** LLM-as-judge, binary verdict plus reason string, fed back into regeneration. Applies to all roles including `diagnostic_probe`.
- **L5 — Safety.** Blocklist plus classifier. Reject: violence, death, illness, injury, money amounts, romance, real people, brand names, body-image content, anything inappropriate for a 6–12 year old. Applies to all roles without exception.
### 7.10 Configuration
All thresholds MUST be runtime configuration, not constants: retry count, length bands, occurrence bounds, judge threshold, worksheet item count, `allowed_with_ruby` set membership, review-queue depth ceiling, cohort overlap threshold, relaxation-rate ceiling, **`ruby_policy` and its grade boundary (§9.6)**.
---
## 8. LLM integration
### 8.1 Provider abstraction (MUST)
All model calls go through a single internal interface with a swappable provider adapter. The validation layer makes providers interchangeable; do not couple business logic to any vendor SDK. A future public-sector channel may require domestic Japanese models.
### 8.2 Permitted and prohibited uses
| Use | Permitted |
|---|---|
| Candidate item generation (L1) | ✓ |
| Naturalness judgement (L4) | ✓ |
| Safety classification (L5) | ✓ |
| Rewrite proposals for `REWRITE_RECOMMENDED` spans | ✓ |
| Parent report comment line | ✓ |
| **Tier assignment (§7.4)** | **✗ — prohibited outright** |
| **Diagnostic scoring** | **✗ — deterministic** |
| **Support routing or intent classification (§11.8)** | **✗ — no chatbot in V1** |
### 8.3 Task routing
| Task | Volume | Tier | Rationale |
|---|---|---|---|
| Item generation | High | Cheapest model clearing target pass rate | Short output, low creative bar |
| Naturalness judge | High | Cheapest tier | Binary classification |
| Report comment | ~1/student/month | Highest tier | Parent-facing; cost irrelevant |
Start item generation on the cheapest tier and measure. If first-pass validation clears ~85%, the cost differential outweighs extra regeneration.
### 8.4 Cost mechanics (MUST)
- **Prompt caching.** Static prefix — system prompt, curriculum constraint block, few-shot examples — MUST be byte-identical across calls and positioned first. Variable content last.
- **Batch API.** Monthly report generation runs as an overnight batch on the 1st.
- **Metering.** Token usage recorded per org per month from day one, though billing is flat.
- **Guardrails.** Soft alert at 150% of modelled per-org spend; hard throttle at 400%. Rate-limit per-item regeneration to 20 per worksheet per user per hour.
**Modelled baseline:** a 30-student branch at 80% cache hit runs roughly 0.5M input / 0.3M output tokens per month. Verify against real metering by week 12.
---
## 9. Document rendering
The highest-risk subsystem, because its failure modes produce **valid-looking output that is wrong.**
### 9.1 Engine selection (decided)
**Headless Chromium, server-side, rendering from server-generated HTML/CSS.**
- **MUST NOT** use client-side `window.print()`. Browser print rendering is inconsistent and breaks font embedding.
- **WeasyPrint is rejected.** Its API reference states `writing-mode` is unsupported, making the V1.1 vertical path (§9.9) impossible; ruby and 禁則処理 support are also weaker.
### 9.2 Typeface — single weight, with placeholder provision (MUST)
Worksheets and reports MUST ship rendering in **教科書体** under a Morisawa server license, **in a single weight.** The answer key distinguishes answers by **colour alone.**
1. **The Font Integrity Gate (§15.3) is strongest at exactly one embedded font.** Each additional licensed weight weakens its assertion.
2. 教科書体 is substantially a single-weight design tradition; a bold cut reads as incorrect to Japanese instructors.
3. Red on white is fully legible at worksheet sizes.
4. It reduces license cost — the least important reason.
**Corollary (MUST):** *all* text in every generated PDF — headers, labels, page numbers, footers — uses the same licensed font. No ゴシック chrome inside a PDF, or the gate breaks.
**Placeholder-font provision (new in 2.3).** §15.3 asserts *exactly one embedded font*; it is font-agnostic and does not assert a specific foundry. **Rendering work in Sprints 3–6 therefore proceeds against a placeholder single-weight CJK font with adequate glyph coverage**, and §15.3 goes green on it. Substituting the licensed file is a configuration change plus one round of verification against the real subset, `fsType` bits, and glyph coverage. This is why §19.1 blocks launch rather than Sprint 3.
The placeholder MUST be clearly marked as such in configuration, MUST NOT appear in any build target at launch (§21), and MUST NOT be used for any artifact shown to a pilot juku or a parent.
- Font embedded and subsetted server-side
- **MUST NOT** depend on any client-installed font
- **MUST NOT** be served from a publicly reachable URL. A public `@font-face` source constitutes distribution, not embedding
### 9.3 No fallback (MUST)
```css
font-family: "SenjiPrimaryFont";  /* single family, no fallback stack. ever. */
```
Chromium silently substitutes a fallback font for any glyph missing from the subset. The PDF renders, looks plausible, and the correct glyph forms are gone for exactly the complex characters that matter most.
### 9.4 Font load synchronisation (MUST)
```js
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(() => document.fonts.status === 'loaded');
if (!loaded) throw new Error('font load incomplete — aborting render');
```
**Throw, do not warn.** A failed render is recoverable; a wrong render reaches a parent.
### 9.5 Glyph coverage — bounded and unbounded sets (MUST)
**Bounded (pre-subset at build time):** worksheet content is constrained by §7.2 to `allowed_bare ∪ allowed_with_ruby` plus kana, digits, and permitted punctuation. Subset once to this superset; do not subset per render.
**Unbounded:** three fields are user-supplied and contain arbitrary Japanese, including 異体字 and 環境依存文字 common in proper nouns — 髙 (not 高), 﨑, 濵, 邊/邉:
- `branches.report_display_name`
- `students.display_name`
- the instructor-edited comment line
These carry span role `proper_noun` and are **EXEMPT from reading analysis** (§7.5) — but they are fully subject to glyph coverage. A juku named 髙木ゼミナール would otherwise silently fall back on the character in their own name, on the document they hand to parents.
Handle by **either** extending the subset to JIS Level 1+2 plus common IVS variants for these fields, **or** validating at input time and warning the manager that a character cannot be rendered.
### 9.6 Ruby rendering (MUST)
Ruby placement is driven **solely by the persisted RenderPlan** (§7.6), never by grade heuristics recomputed from student state at render time.
- `suppressed_spans` render without ruby under all conditions, overriding everything below
- `ruby_spans` with `reason: required` **always** render ruby
- `ruby_spans` with `reason: recommended` render conditionally, per `organizations.ruby_policy`:
| `ruby_policy` | Behaviour for `reason: recommended` |
|---|---|
| `conservative` (default) | Ruby applied when `items.grade ≤ 3`; suppressed when `items.grade ≥ 4` |
| `always` | Ruby applied regardless of grade |
| `minimal` | Ruby never applied |
**Rationale.** Japanese textbooks withdraw furigana as grade rises, and over-annotation on a kanji-practice sheet turns the exercise into a reading crutch — the student stops decoding, which is the skill being built. `RUBY_RECOMMENDED` therefore means *permitted and probably helpful*, not *mandatory*; `RUBY_REQUIRED` means the span is unreadable without it.
**Why the condition is org-level and grade-banded rather than per-student.** Both inputs — `items.grade` and `organizations.ruby_policy` — are available at render time without recomputing student state. This preserves §7.6's persistence guarantee and keeps corpus items interchangeable across students, which a per-student rule would break.
The grade-3 boundary is a default pending pilot validation (§19.5). Ruby positioning is verified against the active font as part of §15.3's canary.
### 9.7 Japanese typography (MUST)
`line-break: strict` set explicitly. Chromium defaults will start a line with 、 or 。.
### 9.8 Runtime (MUST)
**The renderer runs as a dedicated always-warm container** — Cloud Run with `min-instances=1`, or equivalent — **not as a serverless function.** Cold-start Chromium is 3–8 seconds before rendering begins, exceeding the §14 p95 target on its own.
### 9.9 Writing direction — horizontal in V1, vertical in V1.1
**V1 renders horizontally (横書き)** for worksheets, answer keys, parent reports, and all UI.
**Architecture MUST preserve the vertical path** via three-layer separation:
```
content/semantic layer  →  template layer  →  rendering layer
                           practice_horizontal
                           reading_vertical      (V1.1)
                           parent_report
```
Templates are named and selectable in V1 even though only horizontal templates ship. V1.1 adds `vertical_kanji_copybook`, `vertical_reading_comprehension`, `vertical_composition_prompt`.
**Sprint 5 vertical smoke render (MUST).** One throwaway vertical render, not a feature and not shipped, proving the template layer actually separates. May be performed against the placeholder font.
Vertical layout depends on the font's OpenType `vert`/`vrt2` alternates. See §19.1.
### 9.10 Layouts
| Document | Format | Notes |
|---|---|---|
| Worksheet | A4, 8–20 items (config, default 12) | Practice squares (マス) with guide lines for 書き取り |
| Answer key | A4 | Answers in red; identical numbering; same font weight |
| Parent report | A4, single page | Branch branding in header (§10) |
`printBackground: true` required for マス shading.
---
## 10. Parent report
### 10.1 Required blocks
| Block | Content |
|---|---|
| Header | Branch logo + `report_display_name`, student name, period |
| 漢検 progress | Bar toward `kanken_target_level`; days to `kanken_target_date` |
| This month | Kanji practiced, kanji mastered, practice records captured |
| Weak points | Up to 5 kanji, each with the **specific failing reading** and one concrete example of the error |
| Growth | Month-over-month delta; one named improvement |
| Next month | Focus areas |
| Comment | Auto-generated single line, instructor-editable before export |
Vendor branding appears only as a single small footer line.
### 10.2 Specificity constraint (MUST)
The report's entire commercial value is that it could not have been written about any other child.
- `reports.content.specific_facts[]` MUST contain **≥5 entries**, each referencing a concrete kanji, reading, or observed error
- Enforced by the Specificity Gate (§15.1)
- **Manual acceptance gate:** generate reports for 10 students in one branch, print, lay side by side. If a parent could swap any two without noticing, the feature does not ship
### 10.3 Mixed provenance (MUST)
Error data may originate from SENJI-generated worksheets (`results`) or from material SENJI did not generate (`manual_error_entries`). The report MUST render identically and MUST meet §10.2 regardless of provenance mix — including for a student whose entire error profile came from manual entry. A juku using eトレ exclusively is a supported, first-class case, not a degraded one.
Whether the report surfaces provenance to the parent is open (§19.6).
### 10.4 Generation and delivery
- Monthly batch on the 1st, plus on-demand generation
- Instructor previews, may edit the comment line, then exports PDF
- Batch export for a whole branch in one action (SHOULD)
- **WON'T:** email delivery to parents
---
## 11. Feature requirements
### 11.1 Subscription and billing (MUST)
| Tier | Student cap | Monthly |
|---|---|---|
| Pilot | 20 | ¥4,980–9,800 |
| Standard | 60 | ¥14,800–19,800 |
| Growth | 120 | ¥29,800+ |
| Multi-site | 250+ | ¥59,800+ |
*Ranges pending pilot validation (§19.5). MUST be configuration, not hard-coded.*
- All features at all tiers. **No feature gating.** The report is the product and MUST NOT sit behind an upper tier
- Flat pricing. **No per-request or usage-based billing exposed to customers**
- **Fair-use ceiling enforced against `organizations.corporate_number`, not `org_id`**
- Annual prepay at 10 months' price; renewal dates default to **April** (新学期)
- **Trial mechanics:** first cohort receives a free first month plus an introductory discount, via `trial_ends_at`, `discount_pct`, `discount_ends_at`. A trial is a state on a chosen tier, not a separate tier
- **MUST support 銀行振込 with 請求書 (PDF invoice) issuance.** Card optional
- Waivable 初期費用 field
### 11.2 診断テスト — diagnostic assessment (MUST)
Solves the cold-start problem and serves as the primary **owned** data source given that practice may occur outside SENJI (§1).
- ~30 items, adaptive across grade bands, ~15 minutes
- Items carry span role `diagnostic_probe` (§7.5) and deliberately probe above assumed grade
- Produces a complete report immediately from one sitting
- Seeds `error_profile` so first worksheets are already targeted
- **Re-runnable on a recurring cadence** (monthly or termly, configurable). `diagnostics.cadence` distinguishes the two
- Doubles as the free-trial artifact and sales demo
- Deterministic scoring — no LLM
### 11.3 Worksheet generation (MUST)
1. Select student → targets ranked by (a) error profile weakness, (b) 漢検 target gap, (c) curriculum position; manual override available
2. Select sheet type: 書き取り / 読み / 熟語 / 混合 (default 混合)
3. Select item count — configurable **8–20, default 12**, targeting 10–15 minutes of student time
4. Generate → preview validated items with ruby rendered per §9.6
5. **Per-item regenerate** (not whole-sheet)
6. Export worksheet + answer key PDFs
Recommended presets (SHOULD): daily micro-practice 8–10 items · standard practice 12–15 · diagnostic review 20–30.
Instructor burden is driven by how many items require manual attention, not raw item count. Surface the count of flagged items prominently in preview; target 2–4.
Targeting fidelity for the generated sheet is computed and persisted (§13). Where relaxation occurred (§7.7), the preview MUST indicate which items are off-target rather than presenting them as targeted.
### 11.4 Manual error entry (MUST)
**This feature is what makes the §1 positioning truthful.** Without it, an error profile can only be built from SENJI-generated worksheets, which means the claim "keep using your existing materials" is false and the product silently requires the juku to switch practice sources.
- Quick-entry screen: select student → tap kanji the student missed on any material → optionally specify reading and error kind → save
- Optional `source_label` free-text (e.g. `eトレ`, `学校テスト`, `漢検過去問`)
- Writes to `manual_error_entries`; feeds `error_profile` on equal footing with graded results
- Target interaction time: under 30 seconds for a typical session's errors
- Available to instructors for assigned students
### 11.5 Grading (MUST)
- **The answer key screen IS the grading screen.** Not a separate flow
- Tap missed items. Target ≤20 seconds for a full sheet
- **iPad touch-optimised:** large tap targets, no hover states, no small checkboxes
- Optional free-text capture of the wrong reading given — feeds the report's error example
Grading and manual entry are the two paths that produce error data:
- Prompt when a worksheet is >48h old and ungraded
- Surface error-capture counts on manager and owner dashboards
- Track **error-data capture per student per month, any source** as the primary leading indicator (§13)
### 11.6 Branding (MUST)
Logo and `report_display_name` at branch level, inheriting org defaults.
### 11.7 Review queue (MUST)
Owner-accessible queue of `REVIEW_REQUIRED` classifications (§7.7). Displays the span, its context, the classifier's basis, and the frozen-table rule consulted. Resolution options: approve as-is, approve with ruby, discard. Approved items enter the corpus.
### 11.8 Support architecture (MUST)
Deliberately simple. **No chatbot, no AI intent classification, no confidence-threshold routing, no automated escalation rules.**
**Tier 1 — Static FAQ page.** Maintained list of common questions and answers on the SENJI website. Plain content, easily updated, no logic. A fixed, always-visible prompt at the bottom of every FAQ page: 「お探しの答えが見つかりませんでしたか？Chatworkでお問い合わせください」 with a link/button to add the SENJI Chatwork contact.
**Tier 2 — Chatwork (primary human channel).** A real member of the SENJI team replies directly to the juku owner or instructor. Chosen over phone as the primary channel because one operator can serve multiple juku concurrently, whereas a phone line serves one caller at a time.
**Tier 3 — Published phone number, outsourced (fallback entry point).** A dedicated SENJI number published on the website and support materials, answered by a third-party **電話代行** service. Their operators do not know the product and do not attempt resolution. Their sole function is first-contact triage: caller identity, juku name, contact details, issue summary, forwarded to SENJI by email. Forwarded messages are processed on the same cadence as written support; no additional headcount at launch. Budget target ¥5,000–10,000/month at a low-volume tier (~40–50 calls/month).
**LINE公式アカウント is explicitly rejected** and MUST NOT be built.
**Support hours representation (MUST).** Hours are stated accurately on the website, FAQ, and support materials. Juku operate approximately 16:00–22:00 JST and Saturdays. **Where the 電話代行 provider's hours do not fully cover that window, the gap MUST be stated explicitly rather than implied to be full coverage.** Scheduled maintenance MUST fall outside juku operating hours regardless.
### 11.9 Onboarding materials (MUST)
Two separate deliverables. Neither replaces the other; both downloadable directly from the website.
1. **Onboarding video**, Japanese language, approximately 15 minutes, hosted on the website/help centre.
2. **導入マニュアル PDF**, a text-based practical manual — **not a transcript of the video.** Distinct content, written to be used as a standing reference. The Japanese SME market places high value on a proper written manual independent of video, and many users will look for the PDF before watching anything.
Both are embedded in the in-app help centre and available on the public site.
---
## 12. Screens and form factor
**Responsive web application.** **WON'T:** native mobile app in V1. **WON'T:** offline sync.
| # | Screen | Primary device |
|---|---|---|
| 1 | Login / password reset | Both |
| 2 | Owner dashboard — branches, error-capture counts, targeting fidelity, report status | PC |
| 3 | Branch & roster management | PC |
| 4 | Student detail — profile, error map, provenance, history, 漢検 progress | PC |
| 5 | Worksheet generation wizard | PC |
| 6 | Worksheet preview + per-item regenerate + off-target indicators | PC |
| 7 | **Answer key / grading** | **iPad (touch-first)** |
| 8 | **Manual error entry** | **iPad (touch-first)** |
| 9 | Diagnostic administration & scoring | PC |
| 10 | Report preview, comment edit, export | PC |
| 11 | Batch report generation | PC |
| 12 | Review queue (owner only) | PC |
| 13 | Settings — branding, users, branches, `ruby_policy` | PC |
| 14 | Subscription & invoices | PC |
| 15 | Help centre — embedded video, manual download, link to public FAQ and Chatwork contact | Both |
The public-facing static FAQ page (§11.8) is part of the marketing site, not the application.
---
## 13. Instrumentation
**Product health**
- Validation first-pass rate, per layer, per model
- **Tier distribution across generated spans** — a shift indicates classifier or curriculum-data drift
- **Ruby application rate**, split by `reason` — detects a `ruby_policy` misconfiguration producing over- or under-annotation
- Review queue depth and drain rate
- Corpus cache hit rate (→ gross margin)
- Regeneration rate per item
- Generation and render latency
**Personalization health (§1.1, §7.1b)**
- **Targeting fidelity** — proportion of items on a worksheet mapping to the student's top-N recorded weak points. Persisted per worksheet, aggregated per branch
- **Target relaxation rate** — frequency of §7.7 relaxation events, per branch and per student
- **Cohort overlap** — measured item overlap between worksheets generated for the same branch on the same day
- **Error-data capture per student per month, any source** — primary leading indicator
**Commercial health**
- Reports generated / exported per branch per month
- Active students vs. tier cap, by `corporate_number`
- Token spend per org per month
- Trial → paid conversion
**Retention proof (from month 6)**
- 退塾率 among students receiving reports vs. those not
---
## 14. Non-functional requirements
| Area | Requirement |
|---|---|
| Generation latency | p95 < 15s per worksheet |
| PDF render | p95 < 5s (requires §9.8 warm container) |
| End-to-end task | Login → exported worksheet PDF < 90s, unaided, measured |
| Manual error entry | Typical session captured in < 30s |
| Validation | First-pass rate > 92% by week 8 |
| Corpus | Cache hit > 50% by month 3, > 80% by month 6 |
| Targeting fidelity | ≥ 80% median across generated worksheets |
| Availability | 99% target; maintenance outside 15:00–23:00 JST and Saturdays |
| Browsers | Latest 2 versions of Chrome, Edge, Safari (incl. iPadOS Safari) |
---
## 15. Build gates
Six build-breaking CI gates. Each exists because the corresponding failure is silent and reaches a customer before it reaches the team.
### 15.1 Specificity Gate
For any two students in the same branch and period, Jaccard similarity of `reports.content.specific_facts` MUST be **< 0.5**. Also asserts `specific_facts.length >= 5`. Includes at least one fixture whose error profile derives entirely from `manual_error_entries` (§10.3).
### 15.2 PII Privacy Gate
Build fails if any field originating from `students`, `users`, `branches`, or `organizations` is reachable from the LLM client.
**The gate MUST inspect the actual outbound payload** at the §8.1 choke point — serialising the request as it would be transmitted and asserting no student-derived value appears in it. A gate that only inspects type signatures, call sites, or intermediate objects does not satisfy this requirement.
*Rationale: sales material states 生徒の個人情報は生成AIに送信しません. It must be literally true.*
### 15.3 Font Integrity Gate
Render a canary containing all 1,026 kyōiku kanji, the configured `allowed_with_ruby` extension set, full kana, permitted punctuation, ruby-annotated spans under each `ruby_policy` value, and a proper-noun fixture set including 髙 﨑 濵 邊. Parse the output PDF's font resource dictionary and assert **exactly one embedded font.**
Font-agnostic by design (§9.2) — it passes on the placeholder font and on the licensed font alike. It verifies the *mechanism*, not the foundry. Licensed-font specifics are verified at substitution time and gated by §21.
### 15.4 Tenant Isolation Gate
Automated tests attempt cross-tenant reads at org, branch, and assignment scope and assert failure. **Coverage MUST include every tenant table, join and assignment tables included** — `user_branch_assignments` and `student_instructor_assignments` are in scope and MUST carry RLS.
### 15.5 Classifier Determinism Gate
Run the regression set through §7.4 twice in the same build and assert byte-identical `reading_analysis` output including span offsets, plus stability against a committed golden file.
**Regression set (minimum coverage):** 今日, 明日, 大人, 一人, 一日, 二十日, 今年, 人気, 河原, 眼鏡, 生, and the 手紙 / 紙 rendaku pair.
### 15.6 Targeting Fidelity Gate
Against a fixture set of students with deliberately distinct error profiles, generate worksheets and assert:
- **Targeting fidelity ≥ 80%**
- **Cross-student divergence** — item overlap between any two fixture students' worksheets below the configured cohort threshold (default 20%)
- **Relaxation is visible** — any relaxation event appears in `worksheets.relaxation_events` and is reflected in the persisted fidelity figure
*Rationale (§1.1): without a gate, targeting degrades gradually through corpus reuse and relaxation fallbacks, each individually defensible, until worksheets are effectively generic — the exact failure the product was built to prevent.*
---
## 16. Security, privacy, compliance
### 16.1 Tenant isolation (MUST)
Postgres row-level security on **every** tenant table keyed by `org_id`, with branch-level and assignment-level scoping above it. Join and assignment tables are tenant tables and carry `org_id` and RLS. Covered by §15.4.
### 16.2 LLM data boundary (MUST)
**No student name, identifier, age, branch, or organisation is ever transmitted to any LLM provider.** Only `(grade, character sets, reading targets, item type, span role profile, topic hint)`. Enforced by §15.2, which inspects the serialised outbound payload.
### 16.3 Data handling
- Personal data minimised. `students.display_name` may be an internal ID at the juku's discretion
- Retention: error profiles and reports retained while subscription is active plus 90 days
- Export and deletion endpoints for departing customers
- 個人情報保護法 委託先 contract terms available on request
- **電話代行 provider is a 委託先 handling customer contact data.** A data-handling agreement with the provider is required before the number is published
- Audit log entries for report export, roster changes, permission changes, review-queue resolutions
- Public site MUST carry プライバシーポリシー and 特定商取引法に基づく表記
- All customer-facing Japanese copy reviewed by a native speaker before publication. Ownership and cadence open (§19.10)
### 16.4 Font license compliance
- Font file never publicly reachable (§9.2)
- Single weight licensed and embedded
- Subsetting performed only within the scope confirmed in §19.1
- `fsType` embedding permission bits verified against the delivered file at substitution time
- Placeholder font (§9.2) removed from all build targets before launch (§21)
- PDF permission flags may be set for contractual compliance. **They are trivially bypassed and are not a security control**
---
## 17. Stack and infrastructure
| Layer | Choice |
|---|---|
| Frontend / API | Next.js + TypeScript |
| Hosting (app) | Vercel |
| Database / Auth | Postgres (Supabase), RLS for tenancy |
| Morphology | SudachiPy + UniDic (MeCab / Juman++ acceptable alternates), containerised |
| Reading classifier | Deterministic service over frozen tables + rules. No LLM (§7.4) |
| **PDF rendering** | **Headless Chromium in a dedicated warm container. Not serverless** |
| LLM | Provider-abstracted; server-side calls only |
| Object storage | S3-compatible (logos, generated PDFs) |
| Batch | Scheduled job runner for month-end report generation |
| CI | GitHub Actions — six build gates (§15) plus the §6.5 PDF hash verification workflow |
| Support | Static FAQ (marketing site) + Chatwork + third-party 電話代行. No chatbot infrastructure |
---
## 18. Milestones
Engineering deliverables and externally-owned dependencies are tracked separately. A milestone week is complete when its engineering deliverables are complete; external dependencies have their own owners and trigger dates and do not gate week completion.
### 18.1 Engineering deliverables
| Weeks | Deliverable |
|---|---|
| 1 | Repo, CI, environments. Curriculum ingestion + provenance manifest + §6.5 hash workflow. **Tier enum and §7.5 span-role policy table frozen by end of week** |
| 1–2 | Character table with §6.5 CI green. Reading-stage extraction, Grades 1–6 |
| 2 | **§15.5 regression set delivered.** Junior-high/high-school readings, appendix words, kana normalisation, deduplication |
| 3 | Generation + classification pipeline, CLI only. Pass rate, tier distribution, targeting fidelity reported |
| 3–4 | Diagnostic + report generator, CLI only. 10 sample reports; §10.2 manual gate applied |
| 4 | **Concierge pilot** — pilot juku run the paper diagnostic; reports returned by email within 24h. No UI required |
| 5–6 | Rendering container live with §15.3 green **on the placeholder font**. **Sprint 5 vertical smoke render.** Web UI: roster, generate, preview, export |
| 7 | Grading screen, manual error entry, error profile, capture nudges. §15.6 green |
| 8 | In-app report generation, branding upload, batch export, review queue |
| 9 | Auth hardening, §15.4 green across all tenant tables, subscription + trial mechanics + 請求書 billing |
| 9–10 | Support infrastructure live; onboarding video and 導入マニュアル PDF produced (§11.9) |
| 10 | Pilot conversion to paid |
**Week 4 is the program gate.** If pilot 塾長 respond politely rather than asking to show the report to parents, stop and re-evaluate before further UI investment.
### 18.2 Externally-owned dependencies
| Item | Owner | Trigger |
|---|---|---|
| §19.1 Morisawa license | Founder | **Escalate if no substantive response by end of Week 3.** Blocks launch, not Sprint 3 |
| §19.2 Reading-stage / lexical table extraction | Founder | Weeks 1–2. Blocks Sprint 3 build |
| §19.9 電話代行 provider selection | Founder | Before Week 9 |
| §19.10 Native-speaker copy review | Undecided | Before Week 9 |
| Pilot juku sourcing | Named owner, outside this workstream | Before Week 4 |
---
## 19. Open items
### 19.1 教科書体 server license — **BLOCKS LAUNCH; does not block Sprint 3 build**
In progress with Morisawa. Budget reserved ¥250,000–300,000/year; single weight expected at the lower end.
Reclassified in 2.3: §15.3 is font-agnostic, so Sprints 3–6 proceed against a placeholder font (§9.2) and substitution is a configuration change plus one verification round. The license gates launch and §21, not the build.
**Escalate if no substantive response by end of Week 3.** Confirm in writing:
- Is subsetting within the permitted scope? (サブセット化して PDF に埋め込むことは許諾範囲に含まれるか)
- How is a "server" counted under container autoscaling?
- `fsType` embedding permission bits on the delivered file
- **Does the weight include complete `vert`/`vrt2` tables and vertical metrics?** Terms deferred to V1.1 (§9.9), but a negative answer should be known before signing a multi-year license
### 19.2 Reading-stage and lexical tables — BLOCKS SPRINT 3
Extraction from the MEXT 音訓割り振り表 (March 2017) and lexical exception curation. Weeks 1–2 per §18.1. Owned by the founder. Everything in §7.4 depends on it. Unlike §19.1, this has no placeholder path — the classifier cannot be built against invented staging data.
### 19.3 Span-role table completeness — closes end of Week 1
§7.5 specifies six roles; the `target`-row ruby ambiguity is resolved in 2.3. Genuinely unresolved:
- Should `diagnostic_probe` bypass L4 naturalness as well as the grade gate? Current spec says no — but a probe item deliberately using rare vocabulary may fail naturalness for the wrong reason
- Should the answer key carry ruby on the revealed answer to assist the instructor? Note this is a *rendering* question about the answer-key document, not a change to §7.6's suppression rule for the worksheet
### 19.4 Vertical writing validation — decides V1.1 scope
V1 ships horizontal (§9.9). Protocol: interview 5–8 pilot instructors with A/B printed samples. **Retain horizontal default if** ≥70% accept horizontal kanji worksheets **and** ≥80% accept horizontal parent reports **and** no pilot juku names vertical as a pre-launch hard requirement. **Escalate to a hard blocker only if** ≥2 pilot juku state they will not use or pay without it **and** their core use case is kokugo reading, composition, or textbook-style printing.
### 19.5 Business inputs pending pilot validation
- Tier price points within the §11.1 ranges
- Default worksheet item count (currently 12)
- **`ruby_policy` default and the grade-3 boundary (§9.6)** — show pilot instructors sheets at each policy setting and ask which matches their teaching
- Average 月謝 in the target segment — elementary once-weekly individual tutoring runs roughly ¥10,000–18,000/month
- 漢検 group-exam posture, segmented three ways
- Whether the juku uses eトレ or equivalent, and what it charges students for it
- What the juku currently gives parents — replacing a workflow vs. creating one
- Decision authority: independent owners decide directly; franchise branches escalate to HQ. **First pilot segment: independently operated, 1–3 branches, 20–100 elementary students, owner still actively teaching**
Per §1.1, these findings are triaged by whether they affect the juku's ability to deliver individualization at scale; pricing and packaging findings rank below that.
### 19.6 Report provenance display
Whether the parent report should surface whether errors came from SENJI worksheets or manual entry (§10.3) — and whether doing so strengthens or weakens the perception of individualised instruction — is unresolved. Default for now: internal only.
### 19.7 Trial and fair-use edge cases beyond corporate_number
Keying fair use to `corporate_number` (§11.1) closes the obvious multi-org split. Not yet addressed: sole proprietorships without a 法人番号, and repeat trials under a new organisation by the same operator. Needs a decision before the Pilot tier goes public.
### 19.8 Operational infrastructure — RESOLVED in 2.2
Phone support, support channel architecture, and onboarding materials are specified in §11.8 and §11.9. Remaining sub-items at §19.9 and §19.10.
### 19.9 電話代行 provider selection
Provider not yet chosen. Criteria: Japanese-language answering, email forwarding, coverage of juku operating hours (16:00–22:00 JST + Saturdays) or clear disclosure of the gap (§11.8), and willingness to execute a 委託先 data-handling agreement (§16.3). Budget ¥5,000–10,000/month.
### 19.10 Native-speaker review of Japanese customer-facing copy — OPEN
All customer-facing Japanese copy — website, product UI, FAQ, onboarding video and manual, sales materials — must be reviewed by a native speaker before publication (§16.3). Undecided:
- **Who performs it** — in-house native speaker vs. external proofreading/translation service
- **At what cadence** — one comprehensive pre-launch review vs. ongoing review as new copy is produced
Needs resolution before the Week 9–10 support-infrastructure milestone, since the FAQ, manual, and video script all fall under it.
### 19.11 Tracked outside this document
Pilot juku sourcing has a named owner and channel and is managed outside the technical workstream. Recorded for completeness only; no action required from the engineering team.
---
## 20. Explicitly out of scope for V1
Stroke-order recognition or scoring · handwriting input · student login · parent login · email delivery to parents · gamification · subjects other than kanji · native mobile app · offline mode · franchise 本部 hierarchy · vertical writing templates (V1.1) · **support chatbot** · **AI intent classification or confidence-threshold support routing** · **automated support escalation rules** · **LINE公式アカウント** · analytics beyond §13 · usage-based customer billing · consumer-facing product
---
## 21. Definition of done
1. All **MUST** requirements implemented
2. Validation first-pass rate > 92% on a 200-item held-out evaluation set
3. **All six build gates green** (§15): Specificity, PII Privacy, Font Integrity, Tenant Isolation, Classifier Determinism, Targeting Fidelity
4. **§15.2 verified to inspect the serialised outbound payload**, not merely call sites or type signatures
5. **§15.4 verified to cover every tenant table**, including `user_branch_assignments` and `student_instructor_assignments`
6. Manual 10-report side-by-side gate cleared (§10.2), including one report derived entirely from manual error entry
7. **Licensed 教科書体 embedded; placeholder font removed from every build target** and `fsType` / subset scope verified against the delivered file (§9.2, §16.4)
8. Font load failure throws and aborts render, verified by fault injection (§9.4)
9. Proper-noun fixture set renders in the licensed font, no fallback (§9.5)
10. Ruby renders per RenderPlan and `ruby_policy`; no ruby appears over any `suppressed_span` at any tier or policy setting (§7.6, §9.6)
11. Sprint 5 vertical smoke render completed and archived (§9.9)
12. Median targeting fidelity ≥ 80% across a representative worksheet sample (§14)
13. Login → exported worksheet PDF in < 90s by an instructor with no training
14. Grading of a full sheet in < 30s on iPad; manual error entry session in < 30s
15. 3 pilot juku using the system weekly without prompting
16. 請求書 issuance and trial-to-paid conversion working end to end
17. **Support live:** static FAQ populated, Chatwork contact published, 電話代行 contracted with 委託先 agreement executed and number published with accurate hours
18. **Onboarding live:** Japanese video and separate 導入マニュアル PDF both produced and downloadable (§11.9)
