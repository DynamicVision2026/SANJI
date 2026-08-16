V1 Engineering Specification — Unified

**Product:** Kanji diagnostic and remediation instrument for 個別指導塾 (working name: SENJI)
**Document version:** 2.4
**Repository:** `DynamicVision2026/SANJI`
**Supersedes:** Product spec R1, R2; Engineering spec 1.0, 2.0, 2.1, 2.2, 2.3; §7A design document; v2.4 amendment set. **This is the single source of truth.**
**Audience:** Development team

### Changes from 2.3
- **§1** Rewritten. Product restated as a diagnostic instrument built on a detect–prescribe–verify loop, not a targeting engine. Records that v2.3's §1 was satisfiable by a per-kanji ratio
- **§1.2** New. Parent report established as co-equal product, not infrastructure
- **§2** Glossary extended for the hypothesis layer
- **§5.2** `items.distractors`, `items.discriminates`; structured wrong-answer capture on `results`; new `hypothesis_master`, `student_hypothesis_state`, `candidate_hypothesis` tables
- **§6.1** Domain assets extended: confusable pairs, 同訓異字 / 同音異義語 sets, 連濁・音便 exemplars
- **§7.3** **Breaking:** `target_reading_id` → `target_reading_ids[]`. Week 1 freeze lifted for this field only
- **§7A** New layer — diagnostic hypothesis taxonomy, item tagging, evidence weighting, open hypothesis path, remediation generation pattern, behavioural verification
- **§8.2** Permitted-use table extended; **§8.5** new — complete LLM call-site audit; §7.3's determinism principle reformulated to something defensible
- **§10.1** Report becomes diagnosis-led; **§10.2** new containment assertion
- **§11.3** `item_type: contrastive`; probe/treat/mixed objectives; held-out re-probe
- **§11.5** Wrong-answer capture semi-required for 書き取り
- **§13** Hypothesis distribution, confidence distribution, resolution rate
- **§15.1** Additions A/B/C; **§15.2** extended to the §7A.5 outbound class; **§15.7** new Clinical Language Gate
- **§18** Restructured. Week 2 blind-cloze experiment added; Sprint 3 extended ~1 week; Week 4 program gate held fixed
- **§19** Domain asset list superseded; §19.10 absorbs the recurring review obligation

---

## 0. How to read this document

Sections 1–4 are context. Sections 5–17 are binding implementation requirements. Section 15 defines the automated gates. Section 21 defines done. Section 19 lists items not yet closed.

Requirement keywords: **MUST** = V1 blocking. **SHOULD** = build if it does not delay launch. **WON'T** = explicitly out of scope, do not build.

Every section is written to be self-contained. If a section appears to contradict another, that is a defect — report it rather than choosing an interpretation.

### 0.1 Governance of acceptance criteria

**Acceptance criteria may not be downgraded, waived, or reclassified by the implementing role.** Where a criterion appears unachievable or inappropriate, it is raised for decision and the resolution is recorded. **An unrecorded waiver is a defect independent of the outcome it produced** — a correct result reached by unilaterally relaxing a stated requirement is still a process failure, because the next such decision may not be correct and nothing in the record would distinguish them.

Recorded waivers to date: §6.1.1.
Recorded framing defects to date: §1.1 (v2.3 §1 satisfiable by a gradebook).

---

## 1. Product summary

A B2B SaaS system sold to private tutoring schools (juku) in Japan as a **student-retention tool**.

### 1.0 What the product is

**SENJI is a diagnostic instrument for kanji acquisition.** It detects, for one specific child, not merely *which characters* are failing but **which kind of failure** is occurring — reading selection, homophone substitution, phonological alternation, visual confusion, production–recognition asymmetry, and so on. It then prescribes practice matched to that diagnosis, and **re-tests the diagnosis on held-out material to confirm the intervention worked.** Where evidence is insufficient to support a diagnosis, it says so rather than asserting one.

That three-part loop — **detect the failure mode, prescribe the matched remediation, verify it took** — is what makes this an instrument rather than an error tally with a friendly report attached. A system that records which kanji a student got wrong, ranks them by failure count, and generates more practice on those same kanji is a gradebook. Every static question bank in this market already does that. The differentiation claimed throughout this document rests entirely on the loop above, and nothing else substitutes for it.

### 1.1 Why this exists, and the standing design check

個別指導塾 sell individualized instruction as their core promise to parents. That promise has a structural limit: genuine personalization — diagnosing each student's specific failure modes and producing material targeted to them — requires instructor time that does not scale with enrollment. Beyond a certain student count, instructors default to generic worksheets, and the juku's core promise quietly erodes.

The instructor is not the bottleneck because they lack skill. They already know how to teach. What no instructor can do at scale, for thirty or eighty students, is hold a precise per-student model of *how* each child's kanji comprehension breaks down and generate matched remediation for each one, every week. **That is the labor SENJI substitutes for.** AI is not the feature being sold; it is the mechanism that keeps the juku's promise intact at scale.

**Competitive positioning — downstream of the above.** SENJI is a diagnostic and reporting layer that sits **on top of** whatever practice material a juku already uses. Incumbent question banks such as eトレ provide large static libraries covering kanji reading, writing, radicals, okurigana, and homophone distinction. SENJI does not compete on library size — it competes on diagnostic depth, which a fixed item pool structurally cannot provide because it has no model of the individual student.

Customer-facing claim: *"Keep using your existing materials. SENJI turns the results into a diagnosis and a parent-readable report."* That claim requires the system to build a complete diagnostic picture for a student who never touches a SENJI-generated worksheet (§11.2, §11.4).

**The standing check.** §1 is not background. It is the standard against which downstream decisions are evaluated:
- **Engineering.** A shortcut that reduces per-student diagnostic specificity — collapsing failure modes, weakening the held-out re-probe, letting corpus reuse or target relaxation dilute targeting — removes the reason the product exists. These paths are permitted but bounded, logged, and gated (§7.7, §7.8, §7A.8, §13, §15.6).
- **Architecture.** The hypothesis layer (§7A), the reading classifier (§7.4), and the evidence-weighting model (§7A.4) are what make "one student, one prescription" literally true. Redesigns are evaluated against whether the detect–prescribe–verify loop survives intact.
- **Coordination.** Pilot findings are weighted by whether they affect diagnostic depth or its legibility in the report. Pricing and packaging rank below both.

**Recorded framing defect (§0.1).** Through v2.3, §1 described the product as diagnosing "each student's specific gaps" and §1.1 as requiring "per-student targeting." **Both were fully satisfiable by a per-kanji ratio.** Nothing distinguished character-level from failure-mode-level diagnosis, which is why a gradebook architecture passed four spec revisions without tripping any stated requirement. The framing above is the correction, not a refinement.

### 1.2 Status of the parent report

**The parent report is a product in its own right, co-equal with the diagnostic engine. It is not infrastructure for the engine, and the engine is not infrastructure for it.**

The report is the only artifact the juku owner or the parent ever sees. Neither can inspect an error profile, a hypothesis state, or a confidence score. **Diagnostic depth that does not surface legibly in the report has no commercial existence** — it is a cost with no revenue attached. Conversely, a beautifully designed report over a shallow diagnosis is the gradebook failure in nicer clothing.

Binding consequence for §10: **the report structure MUST express a hypothesis-level diagnosis, its evidence, its trend, and the prescribed remediation, in language a parent finds credible** — not merely technically accurate. A report that can only list kanji is structurally incapable of carrying what the engine knows, and would silently cap product value at the pre-2.4 level regardless of engine quality.

Any prioritization conflict between diagnostic depth and report legibility is a false trade and should be escalated rather than resolved locally.

### 1.3 Governing principle for LLM use

**LLM wherever a verification mechanism exists; deterministic scaffolding where it does not.** The ratio between generated and curated content is a symptom of where verification is possible, never a target in itself. Optimizing for a balance would be goal displacement.

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
| eトレ | Incumbent static question-bank system. SENJI layers on top of it |
| 漢検 | Kanji Kentei certification. 級 levels run 10級 (easiest) upward |
| 学年別漢字配当表 | MEXT table assigning 1,026 kanji to grades 1–6 |
| 音訓割り振り表 | MEXT table assigning individual readings to school stages |
| 熟語 | Multi-kanji compound word |
| 熟字訓 | Whole-word reading not derivable from constituents (今日 = きょう) |
| 同音異義語 | On-reading compounds sharing a pronunciation (構成/公正/厚生) |
| 同訓異字 | Single characters sharing a kun-reading with semantic distinctions (早い/速い) |
| 付表の語 | Appendix words in the 常用漢字表 with irregular readings |
| 連濁 / 音便 | Compound phonological alternations — voicing, gemination, nasalisation |
| 送り仮名 | Kana inflection tail following a kanji stem |
| 既習漢字 | Kanji the student has already been taught |
| ふりがな / ruby | Reading annotation printed above (or beside) a character |
| 教科書体 | Textbook typeface. Required for handwriting instruction |
| 禁則処理 | Japanese line-breaking prohibition rules |
| 異体字 | Variant character forms common in proper nouns (髙, 﨑, 濵) |
| 縦書き / 横書き | Vertical / horizontal writing orientation |
| Span | A character range within generated text, carrying a role and a tier |
| Tier | One of six reading-difficulty classifications (§7.4) |
| **Hypothesis** | A named failure mode (H1–H9) or validated candidate (HX) — *why* a student errs |
| **Distractor** | An anticipated wrong answer bound to a hypothesis; the grading key that makes an item diagnostic (§7A.2) |
| **Blind cloze** | Verification by having an unanchored model fill a blanked target k times; unanimity required (§7A.7) |
| **Counterfactual substitution** | Verification by substituting the competing character and testing acceptability (§7A.7) |
| **Held-out re-probe** | Re-testing a hypothesis on kanji not practiced, to measure generalisation rather than memorisation |
| 電話代行 | Outsourced Japanese telephone answering service. Triage only (§11.8) |
| Chatwork | Japan-domestic business messaging tool. Primary human support channel |
| Targeting fidelity | Proportion of worksheet items mapping to recorded weak points (§13, §15.6) |
| Placeholder font | Interim single-weight CJK font used before the licensed 教科書体 arrives (§9.2) |

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
| View student hypothesis state | ✓ | ✓ (own 教室) | ✓ (assigned only) |
| Generate/export reports | ✓ | ✓ (own 教室) | ✓ (assigned only) |
| View error-capture dashboard | ✓ (all) | ✓ (own 教室) | ✓ (own students) |
| Access review queue | ✓ | — | — |

**Scoping rule (MUST):** instructors are scoped to **assigned students**, not branches. In 個別指導 the 1:2 or 1:3 pairing is the unit of work.

**Ownership rule (MUST):** student data, error profiles, hypothesis states, and reports belong to the **教室**, never to a user account. Deactivating an instructor MUST NOT affect any student record.

---

## 4. Account hierarchy

```
organizations (法人・事業者)   — billing, plan tier, branding defaults, corporate_number, ruby_policy
  └── branches (教室)          — roster, report branding, seat counting
        └── students (生徒)    — error profile, hypothesis state, 漢検 target, reports
users attach at org level, scoped to branches via user_branch_assignments
```

- **WON'T:** a fourth level for franchise 本部. Not the buyer in V1
- **MUST:** unlimited user accounts at every tier. Billing by student count only — never per instructor
- **MUST:** support moving a student between branches within an org, carrying error profile, hypothesis state, and report history

---

## 5. Data model

Postgres. All tenant tables carry `org_id` and are protected by row-level security (§16.1). **Every tenant table, including join and assignment tables, without exception.**

### 5.1 Tenancy and identity

```
organizations
  id uuid pk, name text, corporate_number text, address text,
  plan_tier enum(pilot,standard,growth,multisite), student_cap int,
  billing_status enum, default_logo_url text,
  ruby_policy enum(conservative, always, minimal) default 'conservative',
  created_at timestamptz
branches
  id uuid pk, org_id fk, name text, report_display_name text,
  logo_url text nullable, address text, created_at timestamptz
users
  id uuid pk, org_id fk, email citext unique, password_hash text,
  role enum(owner, manager, instructor),
  status enum(active, invited, deactivated),
  last_login_at timestamptz, created_at timestamptz
user_branch_assignments                      -- RLS required
  user_id fk, branch_id fk, org_id fk, primary key (user_id, branch_id)
students
  id uuid pk, branch_id fk, org_id fk, display_name text,
  grade smallint, kanken_target_level smallint nullable,
  kanken_target_date date nullable,
  status enum(active, withdrawn), enrolled_at date, created_at timestamptz
student_instructor_assignments               -- RLS required
  student_id fk, user_id fk, org_id fk, active bool,
  primary key (student_id, user_id)
```

### 5.2 Content, results, and diagnosis

```
items
  id uuid pk,
  item_type enum(kakitori, yomi, jukugo, homophone, diagnostic, contrastive),
  target_kanji char, target_reading_ids int[],        -- ★ plural (§7.3)
  body_text text, answer_text text, blank_position int,
  grade smallint, kanken_level smallint,
  max_tier enum, reading_analysis jsonb, render_plan jsonb,
  distractors jsonb,          -- ★ [{surface, hypothesis, basis}] (§7A.2)
  discriminates enum[],       -- ★ hypotheses this item can separate
  verification jsonb,         -- ★ blind-cloze / counterfactual results (§7A.7)
  validation_status enum(passed, failed, manual_review),
  validation_report jsonb,
  source enum(generated, corpus, manual, golden),
  model_used text, usage_count int default 0, created_at timestamptz
  INDEX (target_kanji, item_type, grade, max_tier, validation_status)
  INDEX (discriminates) USING gin
worksheets
  id uuid pk, student_id fk, branch_id fk, org_id fk,
  created_by_user_id fk, sheet_type enum, item_count smallint,
  diagnostic_objective enum(probe, treat, mixed),      -- ★
  targeting_fidelity numeric, relaxation_events jsonb,
  status enum(generated, graded, discarded),
  generated_at timestamptz, graded_at timestamptz nullable
worksheet_items
  worksheet_id fk, item_id fk, position int
results
  id uuid pk, worksheet_id fk, item_id fk, student_id fk,
  is_correct bool,
  response_text text nullable,        -- ★ what the student actually gave
  matched_distractor_idx int nullable,-- ★ which distractor, if any
  inferred_hypotheses enum[],         -- ★ derived (§7A.2)
  discrimination_factor numeric,      -- ★ (§7A.4)
  graded_at timestamptz, graded_by_user_id fk
manual_error_entries
  id uuid pk, student_id fk, org_id fk, kanji char, reading_id fk nullable,
  response_text text nullable,        -- ★ raises weight materially (§7A.4)
  error_kind enum(reading, writing, jukugo, unknown),
  source_label text, observed_at date, entered_by_user_id fk, created_at timestamptz
error_profile                          -- materialized; per-kanji mastery
  student_id, kanji, reading_id, attempts int, correct int,
  mastery_score numeric, last_seen_at timestamptz, provenance jsonb
  primary key (student_id, kanji, reading_id)
hypothesis_master                      -- ★ H1..H9 plus promoted HX
  id enum pk, label_ja text, mechanism_ja text,
  detection_rule text, prescription_template text,
  confirm_events int, confirm_distinct_kanji int,   -- thresholds (§7A.8)
  origin enum(deterministic, promoted)
student_hypothesis_state               -- ★ per-student diagnosis
  student_id fk, hypothesis_id fk,
  confidence numeric, weighted_evidence numeric,
  direction text nullable,
  evidence_item_ids uuid[], evidence_kanji char[],
  first_observed date, last_observed date,
  status enum(watching, active, remediating, resolved),
  primary key (student_id, hypothesis_id)
candidate_hypothesis                   -- ★ open path (§7A.5)
  id uuid pk, student_id fk,
  label text, mechanism text, predicted_signature jsonb, discriminating_probe jsonb,
  v1_holdout_fit numeric, v2_probe_confirmed bool, v3_recurrence_count int,
  status enum(proposed, admitted, active, reportable, promoted, rejected),
  created_at timestamptz
diagnostics
  id uuid pk, student_id fk, administered_at timestamptz,
  cadence enum(initial, recurring),
  estimated_grade_level numeric, estimated_kanken_level smallint,
  report_id fk nullable
reports
  id uuid pk, student_id fk, branch_id fk,
  report_type enum(diagnostic, monthly), period text,
  content jsonb, comment_text text, comment_edited_by fk nullable,
  pdf_object_key text, generated_at timestamptz, exported_at timestamptz
review_queue
  id uuid pk, item_id fk nullable, candidate_hypothesis_id fk nullable,
  request_payload jsonb, reason text,
  status enum(open, resolved, discarded),
  created_at timestamptz, resolved_by fk nullable
subscriptions
  org_id fk, tier enum(pilot,standard,growth,multisite),
  student_cap int, price_jpy int,
  billing_cycle enum(monthly, annual), renewal_date date, status enum,
  setup_fee_jpy int default 0,
  trial_ends_at timestamptz nullable,
  discount_pct numeric nullable, discount_ends_at timestamptz nullable
audit_log
  id, org_id, user_id, action, entity_type, entity_id, metadata jsonb, at
```

---

## 6. Curriculum and domain data layer

Global reference data, not tenant-scoped. Versioned in the repository with migration history.

### 6.1 Sources of record and provenance

| Level | Source | Public? | Status |
|---|---|---|---|
| Character grade | MEXT 学年別漢字配当表 (2017) | Yes | **Complete, validated** |
| Reading stage | MEXT 音訓割り振り表 (March 2017) | Yes | Complete (§19.2) |
| Lexical exceptions | 常用漢字表 付表 + curated 熟字訓 | Yes (付表) | Complete |
| 送り仮名 rules | 送り仮名の付け方 (内閣告示) | **Yes** | Ingestion only |
| **Confusable pairs** | IDS decomposition + pruning | Partial | **§19.3** |
| **同訓異字 sets** | Curated, grade-keyed | No | **§19.3 — 10 sets needed by Week 2** |
| **同音異義語 sets** | Derivable from reading tables + curation | Partial | §19.3 |
| **連濁・音便 exemplars** | Curated (Lyman's Law assists) | No | §19.3 |

**Two-source acquisition rule (MUST).** Official MEXT PDFs are the frozen, legally authoritative source. Third-party transcriptions may accelerate extraction but MUST be cross-verified against official page numbers.

**Provenance granularity (MUST).** Matches the source document's organisation:
- **Block-level** for 学年別漢字配当表 — page attribution per grade range in a committed machine-readable manifest. `kanji_teach_grade` carries no per-row `source_page`, by design
- **Per-row** for 音訓割り振り表 and 付表 — `source_page` mandatory

Rationale for the asymmetry: for a frozen 1,026-row set, the §6.5 checksum is a **stronger** control than page numbers. Page provenance answers *"where did this come from?"*; the checksum answers *"has this changed?"* For a table that should never change again, the second is operative. The reading and lexical tables are dense with scattered entries, so per-row attribution is load-bearing there.

Source PDF SHA-256 is committed alongside extracted data; the manifest references it.

### 6.1.1 Recorded waiver — automated page-map extraction

**Waived:** automated CI production of the provenance page map.

**Technical rationale:** pages 44–47 of the source PDF are vector-rendered glyphs with no extractable text layer. Automated extraction and OCR cannot reliably produce the page map.

**Replacement:** the page map is a committed artifact with a named human verifier and date; CI asserts it exists, is well-formed, and references the committed hash. **The hash verification itself is NOT waived and MUST be automated** (§6.5).

**Recorded per §0.1** because the criterion was initially reclassified by the implementing role rather than raised. The outcome was correct; the process was not.

### 6.2 Schema

```
kanji_teach_grade                 -- character level; block-level provenance
  kanji char pk, teach_grade smallint, kanken_level smallint,
  stroke_count smallint, radical text
kanji_reading_stage               -- reading level
  id serial pk, kanji fk, reading_kana text, reading_type enum(on, kun),
  school_stage enum(elementary, junior_high, high_school),
  elementary_grade smallint nullable,
  source_page int NOT NULL, is_jukujikun bool default false
lexical_reading_rule
  id serial pk, surface text, reading_kana text,
  rule_kind enum(jukujikun, rendaku, proper_noun, furoku),
  min_stage enum, min_elementary_grade smallint nullable, source_page int NOT NULL
confusable_pairs                  -- ★ H8
  kanji_a char, kanji_b char, basis enum(shared_component, stroke_proximity, curated),
  ids_overlap numeric, confirmed_by text, primary key (kanji_a, kanji_b)
homophone_set                     -- ★ H3
  set_id serial, kanji char, surface text, reading_kana text,
  reading_type enum(on, kun), min_grade smallint
dokun_set                         -- ★ H4 (同訓異字)
  set_id serial, kanji char, reading_kana text,
  semantic_note_ja text, min_grade smallint
phono_alternation                 -- ★ H5
  id serial, surface text, component_readings text[], surface_reading text,
  alternation enum(rendaku, sokuon, hatsuon), min_grade smallint
```

### 6.3 Character grade is not a proxy for reading grade

**Binding everywhere downstream.** The same character carries readings assigned to different school stages — 宮 is a Grade 3 character but its reading グウ is not taught until junior high. Any logic inferring reading appropriateness from `kanji_teach_grade` is incorrect and MUST be rejected in review.

### 6.4 Resolution order (MUST)

Lexical rules resolve **before** morphological analysis. A morphological analyser returns a plausible character-by-character reading for 今日 and thereby misses that it is a fixed whole-word form.

1. `lexical_reading_rule` whole-surface match
2. `kanji_teach_grade` character check
3. `kanji_reading_stage` reading check
4. Lexical difficulty heuristics

The highest risk tier produced by any step wins.

### 6.5 CI coverage (MUST)

- Per-grade count assertions: 80 / 160 / 200 / 202 / 193 / 191, total 1,026
- Duplicate detection
- **Checksum assertion over the frozen sorted character set.** Counts alone do not detect substitution — swapping one Grade 6 character for another preserves the count. The 激 omission found during validation is precisely this class of defect
- Provenance manifest present, well-formed, covering every grade block, referencing the committed PDF hash
- **PDF hash verification workflow (automated):** `workflow_dispatch` plus on any curriculum data change; fetch, compute SHA-256, fail on mismatch

### 6.6 漢検 mapping

10級 = grade 1 completion, 9級 = grade 2, 8級 = grade 3, 7級 = grade 4, 6級 = grade 5, 5級 = grade 6.

---

## 7. Generation and validation pipeline

**No item may reach a student without passing §7.7's gate.**

### 7.1 Governing philosophy

Two binding principles; neither may be traded against the other informally.

**(a) Reading stage is a guideline, not an error dictionary.** An above-grade character or reading is usable when paired with ruby; it is not automatically an error. The pipeline answers "under what rendering conditions is this appropriate for this student?" not "is this legal?" Implemented in §7.2, §7.4, §7.5, §7.6. Any reduction to a single whitelist contradicts the product.

**(b) Targeting fidelity is the product's reason to exist (§1.1).** Degradation paths — corpus reuse, target relaxation, templated fallback — are permitted but MUST be bounded, logged, and measurable (§7.7, §7.8, §13, §15.6). A silent degradation is a defect even if rare.

### 7.2 Character sets — L2

| Set | Contents | Effect |
|---|---|---|
| `allowed_bare` | Student's 既習 characters, hiragana, katakana, digits, 、。「」！？, 々, ー | Usable without ruby |
| `allowed_with_ruby` | Broader configured set (default: all 1,026 kyōiku plus configured 常用 extensions) | Usable **only if** RenderPlan assigns ruby |
| reject | Everything else | Hard reject |

Disjoint at evaluation: a character in the student's 既習 set is never forced into ruby.

### 7.3 Request contract

```
GenerationRequest {
  grade: int
  kanken_level: int
  allowed_bare: char[]
  allowed_with_ruby: char[]
  target_kanji: char
  target_reading_ids: int[]        // ★ BREAKING CHANGE from target_reading_id
  item_type: enum
  span_role_profile: enum
  diagnostic_objective: enum(probe, treat, mixed)   // ★
  target_hypotheses: enum[]                          // ★
  contrast_kanji: char | null                        // ★ H8 minimal pairs
  topic_hint: string
  exclude_item_ids: uuid[]
  cohort_exclude_item_ids: uuid[]
}
```

**`target_reading_ids[]` supersedes the singular form.** The Week 1 freeze is lifted for this field only; contrastive items (§11.3) require two readings of the same character. Land this change in isolation before other §7A work.

**MUST:** contains **no student identifier, name, age, branch, or organisation.** Enforced by §15.2.

**MUST:** distractors (§7A.2) are student-facing text and are subject to L2 and L3 for the same student. A distractor using an above-stage reading is indistinguishable from non-recognition and produces false H2 evidence.

### 7.4 Reading analysis — L3

Per-span classification with character offsets, not a per-item verdict — ruby placement requires knowing *which* span is difficult.

| Tier | Meaning |
|---|---|
| `PASS` | Within stage; no annotation needed |
| `RUBY_RECOMMENDED` | Marginal. **Whether ruby renders is decided by §9.6, not here** |
| `RUBY_REQUIRED` | Above stage; unreadable without ruby. Ruby always renders |
| `REWRITE_RECOMMENDED` | Above stage and awkward to annotate; prefer regeneration |
| `REVIEW_REQUIRED` | Cannot be classified with confidence |
| `EXEMPT` | Outside the classifier's scope (§7.5) |

```
reading_analysis = [{ start, end, surface, role, tier,
                      basis: enum(lexical, character, reading, heuristic),
                      source_rule_id }]
```

**Determinism (MUST).** Identical input MUST yield identical tiers on every run. Enforced by §15.5.

**LLM exclusion (MUST).** Excluded from tier assignment entirely — not as authority, tie-breaker, or low-confidence fallback. Low-confidence spans classify `REVIEW_REQUIRED`.

**Supporting assertions:**
- `target_kanji` appears in a token whose in-context reading matches the target
- Length within grade band — G1–2: 12–25 chars; G3–4: 18–35; G5–6: 25–50
- For `homophone` items, ≥1 disambiguating content word present. **Note: presence ≠ effectiveness. Effectiveness is verified behaviourally in §7A.7**
- Target occurrence count within configured bounds (default: exactly 1)

### 7.5 Span roles and action policy

**Six roles. Frozen** — the contract between the classifier and every consumer.

| Role | PASS | RUBY_REC | RUBY_REQ | REWRITE_REC | REVIEW_REQ |
|---|---|---|---|---|---|
| `target` | ✓ | ✓ | **reject** | reject | queue |
| `carrier` | ✓ | ✓ | ✓ | regenerate | queue |
| `diagnostic_probe` | ✓ | ✓ | ✓ | ✓ | queue |
| `static_chrome` | build-time | build-time | build-time | reject | reject |
| `proper_noun` | **EXEMPT** | — | — | — | — |
| `report_body` | ✓ | ✓ | ✓ | ✓ | ✓ |

**Reading this table (MUST).** A ✓ denotes **that the tier is acceptable for that role** — not that ruby is applied. Ruby application is decided solely by §9.6.

- **Ruby NEVER renders on a `target` span, at any tier or policy.** §7.6's suppression is unconditional. `RUBY_REQUIRED` on a target is rejected because the span would be unreadable and cannot be annotated
- **`diagnostic_probe` deliberately inverts the grade gate** — the diagnostic locates a ceiling; rejecting above-grade content makes it incapable of measuring above the assumed grade. Safety (L5) and naturalness (L4) still apply in full
- **`static_chrome`** validated once at build time against Grade 1; `REWRITE_RECOMMENDED` or worse fails the build
- **`proper_noun` EXEMPT, bypasses the classifier entirely** — a glyph-coverage concern (§9.5), not a reading-stage one. Classifying 髙木ゼミナール would produce permanent `REVIEW_REQUIRED` on the customer's own name
- **Instructor UI text never enters the classifier.** Any code path routing UI strings into reading analysis is a defect

### 7.6 RenderPlan

```
RenderPlan {
  ruby_spans: [{ start, end, reading_kana, reason: enum(required, recommended) }]
  suppressed_spans: [{ start, end }]
}
```

**MUST:** `suppressed_spans` overrides `ruby_spans` unconditionally, regardless of tier or policy. Ruby over a target reveals the answer and destroys the item.

**MUST:** `reason` populated for every entry and preserved verbatim — it is §9.6's input. A renderer ignoring `reason` is a defect.

Computed once at validation, persisted, never recomputed at render time.

### 7.7 Gate and failure handling

```
analysis  = classify(item)                      // §7.4, deterministic
plan      = derive_render_plan(analysis)        // §7.6
tags      = tag_hypotheses(item)                // §7A
decision  = apply_policy(analysis, span_roles)  // §7.5
for attempt in 1..3:
    if decision == PASS:  persist(item, analysis, plan, tags); return item
    if decision == REVIEW: enqueue_review(item); break     // do NOT block
    item = generate(request + rewrite_feedback)
fallback = corpus_lookup(key, allow_repeat=true)
if fallback: return fallback
drop_item()
```

**`REVIEW_REQUIRED` never blocks live generation (MUST).**

**Minimum item rule (MUST).** No worksheet below **80% of configured item count**; below that, regenerate with relaxed target selection.

**Target relaxation MUST NOT be silent (§7.1b).** Every event recorded in `worksheets.relaxation_events` with original target, substitute, and reason. Sustained rate above ceiling raises an alert — the generator failing to serve given error profiles is a product defect, not a tuning issue.

### 7.8 Corpus cache — L6

**Key: `(target_kanji, target_reading_ids, item_type, grade, max_tier)`.** `discriminates` is an additional **retrieval filter**, not part of the key — selection issues objective-driven queries ("an item for 果/はて that discriminates H2").

**Scope, stated because §1.1 makes it consequential.** The corpus is a **pool of validated content, not a personalization shortcut.** Personalization resides in *selection* — which kanji, which readings, which hypothesis — not in the novelty of every sentence. Two students both failing 果 on はて may legitimately receive the same validated sentence. High cache hit rates are compatible with high targeting fidelity; the two are measured separately.

**Cohort diversity (MUST).** Visible overlap between students taught together is where reuse damages the product:
- `cohort_exclude_item_ids` populated with items served to other students in the same branch that day
- Overlap between any two same-branch same-day worksheets MUST NOT exceed configured threshold (default 20%)
- Where unsatisfiable from corpus, fall through to generation rather than relaxing

**Selection order:** unseen corpus satisfying cohort diversity → generation → corpus with cohort relaxed (logged) → corpus with repeat allowed.

### 7.9 Remaining layers

- **L1 Generation.** **MUST NOT use logit-level constrained decoding** — Japanese tokenizers do not align to character boundaries and vocabulary masking destroys fluency. Generate → verify → regenerate
- **L4 Naturalness.** LLM judge, binary plus reason, fed back into regeneration
- **L5 Safety.** Blocklist plus classifier. Reject violence, death, illness, injury, money amounts, romance, real people, brands, body-image content, anything inappropriate for a 6–12 year old. **Configured fail-closed and biased toward rejection** — regeneration is cheap, a false negative reaches a child

### 7.10 Configuration

Runtime configuration, not constants: retry count, length bands, occurrence bounds, judge threshold, worksheet item count, `allowed_with_ruby` membership, review-queue ceiling, cohort overlap threshold, relaxation-rate ceiling, `ruby_policy` and grade boundary, blind-cloze k, hypothesis confirmation thresholds.

---

## 7A. Diagnostic hypothesis layer

**Placement:** runs after L5, before L6. It never gates delivery — an item with no discriminative power is still a valid practice item — but its output persists with the item.

**Relationship to §7.4:** siblings, not nested. Both are deterministic per-item classifiers over frozen tables. §7.4 asks *is this appropriate?*; §7A asks *what does this measure?* Neither subsumes the other.

### 7A.1 The taxonomy

**Detectable in V1** (no handwriting capture):

| ID | Hypothesis | Signature |
|---|---|---|
| H1 | Non-recognition | No stable mapping character → any of its readings |
| H2 | On/kun selection failure | Produces a valid reading of the character, wrong one for context |
| H3 | 同音異義語 substitution | Correct reading, wrong character from an on-reading homophone set |
| H4 | 同訓異字 substitution | Correct reading, wrong character from a kun-reading semantic set |
| H5 | Compound phonological alternation | Correct components, failed 連濁 / 音便 / 撥音 |
| H6 | Okurigana error | Correct character, incorrect kana inflection tail |
| H7 | 熟字訓 compositional misread | Reads a fixed whole-word form character-by-character |
| H8 | Visual confusion | Substitutes a form-similar character (未/末, 待/持, 士/土) |
| H9 | Production–recognition asymmetry | Reliably reads a character but cannot produce it |
| HX | Open path | Validated candidate hypotheses (§7A.5) |

**Present in reality, not detectable in V1** — recorded so the taxonomy is not mistaken for complete over the domain: stroke-form and component-construction errors; stroke order. Both require handwriting capture, excluded by §20.

**Modifier, not a hypothesis:** recency over-generalisation (a student who just learned 生 = セイ applying it everywhere) is a *cause* of H2, modelled as `direction` on H2 rather than a separate category.

**Confidence in this list.** High on the categories — they fall out of structural properties of the writing system (multiple readings per character, phonological alternation in compounds, inflection split across scripts, non-decomposable words, dense visual forms, separate recognition and production skills). **Low on relative frequency and priority** — that is empirical and currently unmeasured.

**Validation sources, in order of value:** (1) marked-up worksheets from pilot juku — the only L1 and current source; (2) 漢検 誤答 data; (3) publisher 指導書 つまずき analysis; (4) 国立国語研究所 corpora.

**Warning:** most published kanji-error research is 日本語教育 (JSL) literature on *foreign* learners, whose error distribution differs materially from L1 Japanese children. Use it for mechanism, never for frequency.

### 7A.2 Item tagging

**Diagnosticity comes from construction, not post-hoc analysis.** You do not tag an arbitrary item; you construct items whose wrong answers are informative.

```
items.distractors = [{ surface, hypothesis,
                       basis: enum(reading_table, homophone_set, dokun_set,
                                   confusable_pair, phonological_rule, okurigana_rule) }]
```

Shown for selected-response items; a **grading key** for free-response. Either way the student's actual answer is matched against the distractor table, and the match identifies the hypothesis.

**Derivation logic** — all against frozen tables, no LLM:

**H2 vs H1** — for a 読み item, target kanji K, target reading R, response S:
```
S ∈ readings(K), S ≠ R          → H2. direction = on_for_kun | kun_for_on | same_type
S ∉ readings(K), ∃K' ∈ confusable_pairs(K) with S ∈ readings(K')  → H8, pair (K,K')
S ∉ readings(K), no match, or blank → H1
```
**The discriminator between H2 and H1 is whether the wrong answer is a valid reading of that same character.** One rule, one table lookup, no ambiguity.

**H6** — student kanji correct, tail incorrect → H6; violated rule from 送り仮名の付け方. Distractors generated from the inflection family.

**H5** — S differs from R only by voicing of the second element's initial consonant → rendaku; only by absent 促音/撥音 → onbin. Pure kana string comparison.

**H7** — item surface has a `lexical_reading_rule` of kind `jukujikun` and S equals the compositional reading → H7. §6.4 already computes that reading in order to reject it.

**H3 / H4** — on 書き取り, student wrote another member of the set. Distinguished by whether the set is on-reading compounds (`homophone_set` → H3) or kun-reading characters (`dokun_set` → H4).

**H9** — **requires paired items**: the same (kanji, reading) tested in both 読み and 書き取り. Not derivable from a single item; imposes a construction requirement on selection policy.

**Fallback.** An unmatched response yields `discriminates: []` — contributes to per-kanji mastery, **nothing** to hypothesis inference. Silence, not a guess.

### 7A.3 Evidence weighting

```
weight = source_factor × discrimination_factor × recency_factor
```

| Source | `source_factor` |
|---|---|
| Probe item (constructed to discriminate) | 1.0 |
| Targeted practice item | 0.7 |
| Incidental item (no distractors) | 0.4 |
| Manual entry **without** response text | 0.2 |
| Manual entry **with** response text | 0.7 |

`discrimination_factor` = `1 / |hypotheses consistent with this response|`. Exactly one → 1.0. Three → 0.33. No match → 0, contributing no hypothesis evidence.

`recency_factor` — exponential decay, default half-life 60 days.

**This derives rather than asserts why manual entry is weak.** "Missed 果" with no response detail is consistent with all nine hypotheses — discrimination at floor, source at floor. **And it identifies the fix:** capture what the student wrote, the §7A.2 derivation applies, and the entry becomes genuinely valuable (§11.4).

### 7A.4 Prescription templates

| Hypothesis | Matched remediation |
|---|---|
| H1 | Introduction, not practice |
| H2 | Contrastive items — same character, two contexts forcing different readings |
| H3 | Minimal pairs in disambiguating context |
| H4 | Minimal pairs with semantic forcing |
| H5 | Exemplar sets (alternation is lexically irregular; rules do not generalise) |
| H6 | Inflection-family practice from the 内閣告示 rule set |
| H7 | Bounded memorisation from 付表 |
| H8 | Minimal pairs against the specific confusable neighbour (`contrast_kanji`) |
| H9 | Item-type mix shift toward 書き取り — **selection policy, no new content** |

**Constraint on contrastive items (H2).** §7.4 assertion B requires every reading to be at or below stage. **Contrastive items are only constructible where *both* readings are in-stage** — checkable up front from `kanji_reading_stage`. Where it fails, fall back to sequential items with explicit instructional framing. Expect this more often in lower grades.

### 7A.5 The open hypothesis path

H1–H9 is not a closed list. Individual students exhibit idiosyncratic patterns no nine-category scheme captures. The open path captures, tests, and where general **promotes** them into the deterministic taxonomy. **It is the taxonomy's discovery mechanism, not a permanent escape hatch.**

**Trigger.** ≥6 weighted error events in 90 days matching no distractor, OR ≥4 firing ambiguously across ≥3 hypotheses.

**Outbound payload** — PII-constrained per §16.2:
```
{ grade, item_bodies[], target_kanji[], target_readings[],
  student_responses[], distractor_sets[], hypotheses_fired[], unmatched_count }
```
**No student identifier, name, branch, or organisation.**

**New constraint (MUST).** Student responses become outbound data for the first time. `results.response_text` and `manual_error_entries.response_text` are instructor free-text and could contain anything. **An allowlist admits only strings matching expected answer shapes — kana, kanji, permitted punctuation, within a length bound. Anything else is dropped, not scrubbed.** §15.2 extends to cover this.

**What the LLM produces — a falsifiable candidate, not a diagnosis:**
```
CandidateHypothesis {
  label, mechanism,
  predicted_signature: { applies_to_kanji: char[], predicted_error_form },
  discriminating_probe: { item_type, target_kanji, target_reading, expected_wrong_answer }
}
```

**The `predicted_signature` is the point.** Asking a model "is this diagnosis correct?" invites confirmation of its own framing. Asking for a prediction produces something testable against data it never saw. Direct analogue of blind cloze: **measure behaviour, do not solicit judgment.**

**Content constraint (MUST — hard).** **Candidate hypotheses describe kanji error patterns only. They MUST NOT make any claim about the student's cognition, ability, intelligence, attention, development, or any clinical or quasi-clinical condition.** A deterministic blocklist rejects any candidate whose label, mechanism, or downstream `parent_text` contains clinical, developmental, or ability-attribution vocabulary. Rejected candidates are discarded, not repaired. Gated by §15.7.

This is not stylistic. A parent report reading as a learning-disability assessment is a serious harm to the child, a serious liability for the juku, and existential for SENJI. The system is not qualified to make such claims and MUST be structurally incapable of emitting them.

**Verification — three deterministic mechanisms:**
- **V1 Retrospective fit.** The student's error history is split *before* the call into a shown slice and a held-out slice the model never receives. The candidate is scored on how much of the **held-out** slice its `predicted_signature` explains. A hypothesis fabricated to fit the shown evidence will not predict the held-out slice. Deterministic pattern matching
- **V2 Prospective probe.** Items matching `discriminating_probe` are deployed; the candidate predicts failure; the student either fails or does not
- **V3 Cross-student recurrence.** Independently proposed for ≥3 students across ≥2 organisations, validating under V1 and V2 each time → human review → **promotion into the deterministic taxonomy**, with tables and rules written and the LLM removed from that path permanently

| Stage | Requirement |
|---|---|
| Proposed | Emitted; content constraint passes |
| Admitted | V1 held-out fit ≥ threshold |
| Active for prescription | V2 confirms |
| **Reportable to a parent** | V1 and V2 passed, **and** weighted evidence exceeds the deterministic threshold by a configured margin |
| Promoted | V3 recurrence; human review |

**Candidates face a strictly higher bar than H1–H9 before reaching a parent.** A deterministic hypothesis rests on frozen tables; a candidate rests on a model's proposal. Candidate mechanism prose never appears in the report — `parent_text` is generated under §10.2's containment assertion like every other report sentence.

### 7A.6 Remediation generation pattern

**Prescription leans on generation, not curation, per §1.3.** The scaffolding is the taxonomy, the frozen tables, the verification architecture, and the confirmation thresholds. Content is generated inside it. Static banks are used only where no verification mechanism exists.

1. **Diagnosis → prescription template** (deterministic, §7A.4)
2. **Generation inside the scaffold** — §7.3 constraints plus hypothesis-specific shape
3. **Deterministic verification** — L2, L3, §7A tagging. Always
4. **Behavioural verification** (§7A.7) — where the discriminative property is not deterministically checkable
5. **Empirical promotion** — items answered correctly by students showing no independent evidence of the target hypothesis accrue confidence; the corpus self-validates
6. **Confirmation-threshold decoupling** (§7A.8)
7. **Held-out re-probe** — effectiveness measured on kanji *not* practiced

### 7A.7 Behavioural verification

**Blind cloze.** The target is blanked. A **fresh call with no knowledge of the intended answer** fills it, sampled k times (default 5). Admitted only on unanimous agreement with the intended answer.

Categorically different from LLM-as-judge: nothing is asked to *evaluate*. A model is used as a native-speaker simulator, and disagreement across unanchored samples **is** the signal that the context fails to force the answer. No model holds authority over correctness — frozen tables still define what is correct; blind cloze only decides item admission.

**Counterfactual substitution.** The competing character is substituted; a blind call rates acceptability. Acceptable → the item does not discriminate → reject.

**Empirical promotion.** An item answered correctly by N students showing no independent evidence of its target hypothesis is validated by student data. Human review concentrates at launch and decays.

**Coverage:**

| Hypothesis | Deterministic | Behavioural | Note |
|---|---|---|---|
| H1 | Character presence, stage | — | Fully deterministic |
| H2 | L3 in-context reading | **Blind cloze** on each half | Verifies context actually forces the reading — L3 cannot check this |
| H3 | L3 assertion D (presence) | **Blind cloze + counterfactual** | **Closes a gap that predates v2.4:** presence ≠ effectiveness |
| H4 | Set membership | **Blind cloze + counterfactual** | The hard case; §7A.8 |
| H5 | Phonological form comparison | Blind cloze on carrier | Alternation itself is rule-checkable |
| H6 | 送り仮名 rule set | — | Public authoritative rules |
| H7 | 付表 lookup | — | Bounded set |
| H8 | Pair-table membership | **Counterfactual (primary) + blind cloze** | Substituting the confusable must break the sentence |
| H9 | Cross-item pairing | — | Selection policy, not content |
| HX | V1 / V2 / V3 | — | Prediction-testing |

Five of nine remediation paths are LLM-generated with behavioural verification; three fully deterministic; one a scheduling policy. **That distribution is a consequence of where verification is possible, not a target (§1.3).**

### 7A.8 Confirmation-threshold decoupling

**Item-level and diagnosis-level correctness are separate gates, and the second is where the guarantee lives.**

A non-discriminating item generates false evidence at `discrimination_factor = 1.0` — the student's wrong answer matches the distractor exactly, indistinguishable in the data from a true positive. The harm channel is not pedagogical but **diagnostic pollution**: accumulation toward threshold, a diagnosis reported to a parent, remediation prescribed for a problem the child does not have.

The mitigation is not perfect items. It is a confirmation threshold sized against the item error rate:

| Class | Threshold to reach `active` (reportable) |
|---|---|
| Deterministically verified (H1, H6, H7) | ≥3 weighted events, ≥2 distinct kanji |
| Behaviourally verified (H2, H3, H5, H8) | ≥3 weighted events, ≥2 distinct kanji |
| **H4** | **≥4 weighted events across ≥2 distinct 同訓異字 sets** |
| **HX** | V1 + V2 passed, plus deterministic threshold × configured margin |

At an estimated 2–4% post-verification item error rate, noise clearing the H4 bar is improbable while a real pattern clears it easily. **The gate belongs at diagnosis confirmation, not item generation.**

**Estimated error rates** (unmeasured; the §18 Week 2 experiment supersedes these):

| Configuration | Est. non-discriminating items shipping |
|---|---|
| Generation, no verification | 20–40% |
| Generation + LLM-as-judge | 10–15% |
| Generation + **blind cloze, k=5** | **2–4%** |
| Above + counterfactual | 1–3% |

LLM-as-judge is weak here specifically: asked "does this force 速い?", a model confirms the framing rather than testing whether 早い also works — worst exactly where the distinction is subtlest.

### 7A.9 Closing the loop

After remediation, the next probe re-tests the hypothesis **on held-out kanji, not those practiced.** Re-testing 果 after drilling 果 measures memorisation; testing 生 or 下 measures whether the underlying skill generalised. Only the second indicates the intervention worked.

`student_hypothesis_state.status` transitions `remediating → resolved` when weighted evidence on held-out probes falls below threshold; back on recurrence.

**Mastery is tracked at both levels, permanently.** `error_profile` per (student, kanji, reading) answers *what should this student practice?* `student_hypothesis_state` per (student, hypothesis) answers *what kind of learner problem does this student have?* Neither replaces the other.

---

## 8. LLM integration

### 8.1 Provider abstraction (MUST)

All model calls go through a single internal interface with a swappable adapter. The validation layer makes providers interchangeable; do not couple business logic to any vendor SDK.

### 8.2 Permitted and prohibited uses

| Use | Permitted |
|---|---|
| Candidate item generation (L1) | ✓ |
| Naturalness judgement (L4) | ✓ |
| Safety classification (L5) | ✓ |
| Rewrite proposals for `REWRITE_RECOMMENDED` | ✓ |
| **Blind cloze / counterfactual verification (§7A.7)** | ✓ |
| **Candidate hypothesis proposal (§7A.5)** | ✓ |
| Parent report comment line | ✓ |
| **Tier assignment (§7.4)** | **✗ prohibited** |
| **Hypothesis tagging or scoring (§7A.2, §7A.3)** | **✗ prohibited** |
| **Candidate hypothesis validation (§7A.5 V1/V2/V3)** | **✗ prohibited** |
| **Diagnostic scoring (§11.2)** | **✗ deterministic** |
| **Target selection and ranking (§11.3)** | **✗ deterministic** |
| **Support routing or intent classification** | **✗ no chatbot in V1** |

### 8.3 Task routing

| Task | Volume | Tier |
|---|---|---|
| Item generation | High | Cheapest model clearing target pass rate |
| Naturalness judge | High | Cheapest tier |
| Blind cloze verification | Moderate (corpus build) | Mid tier; latency irrelevant |
| Candidate hypothesis proposal | Low | Highest tier |
| Report comment | ~1/student/month | Highest tier |

### 8.4 Cost mechanics (MUST)

- **Prompt caching.** Static prefix — system prompt, curriculum constraints, few-shot examples — byte-identical across calls and positioned first
- **Batch API** for month-end report generation and for corpus-building verification runs
- **Metering** per org per month from day one, though billing is flat
- **Guardrails.** Soft alert at 150% of modelled spend; hard throttle at 400%. Regeneration limited to 20 per worksheet per user per hour
- **H4 and contrastive generation run 4–6× normal item token cost** due to verification yield loss. Noise against the baseline; H4 is a small share of items

### 8.5 Call-site audit

| # | Site | Decided upstream | Downstream check | On failure |
|---|---|---|---|---|
| 1 | L1 generation | Kanji, readings, grade, sets, hypothesis objective | L2, L3, L5, §7A | Regenerate ×3 → corpus → drop |
| 2 | L4 naturalness | Validity by L2/L3 | **None** | — |
| 3 | Rewrite proposals | Tier assignment | Full re-entry L2→L5 + reclassification | As #1 |
| 4 | L5 safety | — | Blocklist in parallel; instructor preview | Reject |
| 5 | Report comment | Diagnosis, confidence, evidence, all figures | **§10.2 containment assertion** + instructor edit | Fail generation |
| 6 | Contrastive generation | Both readings, stage validity | L3 each half; **blind cloze**; joint minimality unchecked | Sequential fallback |
| 7 | Blind cloze / counterfactual | Intended answer withheld by construction | Unanimity across k samples | Reject item |
| 8 | Candidate hypothesis | Trigger conditions, allowlist filter | **V1 held-out, V2 probe, V3 recurrence — all deterministic**; §15.7 | Reject candidate |

**Unchecked LLM output exists at sites 2, 4, and 6.** All three are bounded to *quality*, not correctness: L2/L3 already guarantee item validity, so a bad L4 verdict ships a clunky but sound item; L5 has a terminal human gate at instructor preview and is configured fail-closed; a weak contrastive pair teaches less, not wrong.

**Governing principle (replaces the earlier "no unchecked LLM output" formulation, which was not accurate):**

> **No LLM output is ever the source of truth for what is correct, what is being taught, or what is wrong with a student.** Fluency and appropriateness judgments may be delegated to a model where the failure mode is bounded to quality and where a human or deterministic gate stands between the output and the student.

---

## 9. Document rendering

Highest-risk subsystem: its failure modes produce **valid-looking output that is wrong.**

### 9.1 Engine

**Headless Chromium, server-side, from server-generated HTML/CSS.**

- **MUST NOT** use `window.print()` — inconsistent across clients, breaks font embedding
- **WeasyPrint rejected** — `writing-mode` unsupported, making the V1.1 vertical path impossible; ruby and 禁則処理 support weaker

### 9.2 Typeface — single weight, with placeholder provision

Ships in **教科書体** under a Morisawa server license, **single weight.** Answer keys distinguish by **colour alone.**

1. **§15.3 is strongest at exactly one embedded font** — each additional weight weakens its assertion
2. 教科書体 is substantially a single-weight tradition; a bold cut reads as incorrect
3. Red on white is fully legible at worksheet sizes
4. Lower license cost — least important reason

**Corollary (MUST):** *all* PDF text — headers, labels, page numbers, footers — uses the same font. No ゴシック chrome inside a PDF.

**Placeholder provision.** §15.3 is font-agnostic. **Sprints 3–6 proceed against a placeholder single-weight CJK font**, and §15.3 goes green on it. Substitution is a config change plus verification of subset scope, `fsType`, and glyph coverage. This is why §19.1 blocks launch, not Sprint 3. The placeholder MUST be marked as such in config, MUST NOT appear at launch (§21), and MUST NOT be used for any pilot or parent-facing artifact.

- Embedded and subsetted server-side; **MUST NOT** depend on client fonts
- **MUST NOT** be served from a publicly reachable URL — that is distribution, not embedding

### 9.3 No fallback (MUST)

```css
font-family: "SenjiPrimaryFont";  /* single family, no fallback stack. ever. */
```

Chromium silently substitutes for any missing glyph. The PDF renders, looks plausible, and the correct forms are gone for exactly the complex characters that matter most.

### 9.4 Font load synchronisation (MUST)

```js
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(() => document.fonts.status === 'loaded');
if (!loaded) throw new Error('font load incomplete — aborting render');
```

**Throw, do not warn.** A failed render is recoverable; a wrong render reaches a parent.

### 9.5 Glyph coverage

**Bounded:** worksheet content constrained to `allowed_bare ∪ allowed_with_ruby` plus kana, digits, punctuation. Subset once; do not subset per render.

**Unbounded:** `branches.report_display_name`, `students.display_name`, and the instructor comment contain arbitrary Japanese including 異体字 — 髙, 﨑, 濵, 邊/邉. These carry role `proper_noun`, are **EXEMPT from reading analysis**, and are **fully subject to glyph coverage.** A juku named 髙木ゼミナール would otherwise fall back on the character in its own name, on the document it hands parents.

Handle by extending the subset to JIS Level 1+2 plus common IVS variants for these fields, **or** validating at input and warning the manager. Do not discover this from a customer.

### 9.6 Ruby rendering (MUST)

Driven **solely by the persisted RenderPlan**, never by heuristics recomputed at render time.

- `suppressed_spans` render without ruby under all conditions, overriding everything
- `reason: required` **always** renders
- `reason: recommended` renders per `organizations.ruby_policy`:

| Policy | Behaviour for `recommended` |
|---|---|
| `conservative` (default) | Applied when `items.grade ≤ 3`; suppressed at ≥ 4 |
| `always` | Applied regardless |
| `minimal` | Never applied |

**Rationale.** Japanese textbooks withdraw furigana as grade rises, and over-annotation turns a practice sheet into a reading crutch — the student stops decoding, which is the skill being built. `RUBY_RECOMMENDED` means *permitted and probably helpful*, not *mandatory*.

**Why org-level and grade-banded rather than per-student:** both inputs are available at render time without recomputing student state, preserving §7.6's persistence guarantee and keeping corpus items interchangeable. Grade-3 boundary is a default pending pilot validation (§19.5).

### 9.7 Typography (MUST)

`line-break: strict` set explicitly — Chromium defaults will start a line with 、 or 。.

### 9.8 Runtime (MUST)

**Dedicated always-warm container** (Cloud Run `min-instances=1` or equivalent), **not serverless.** Cold-start Chromium is 3–8s before rendering begins, exceeding §14's p95 on its own.

### 9.9 Writing direction

**V1 horizontal (横書き)** throughout. **Architecture MUST preserve the vertical path:**

```
content/semantic → template → rendering
                   practice_horizontal
                   reading_vertical      (V1.1)
                   parent_report
```

Templates named and selectable in V1 though only horizontal ships. V1.1 adds `vertical_kanji_copybook`, `vertical_reading_comprehension`, `vertical_composition_prompt`.

**Sprint 5 vertical smoke render (MUST)** — one throwaway render, not a feature, proving the template layer separates. May use the placeholder font. Reserved capability never exercised is aspirational.

### 9.10 Layouts

| Document | Format | Notes |
|---|---|---|
| Worksheet | A4, 8–20 items (default 12) | マス with guide lines for 書き取り |
| Answer key | A4 | Answers in red; identical numbering; same font weight |
| Parent report | A4, single page | Branch branding in header |

`printBackground: true` required for マス shading.

---

## 10. Parent report

Per §1.2 the report is co-equal with the engine and MUST be capable of carrying a hypothesis-level diagnosis.

### 10.1 Structure

| Block | Content |
|---|---|
| Header | Branch logo + `report_display_name`, student name, period |
| 漢検 progress | Bar toward target 級; days to test date |
| This month | Kanji practiced, mastered, practice records captured |
| **今月わかったこと** | **1–2 diagnoses: failure mode in plain language, evidence kanji, occurrence count, trend** |
| **来月の指導方針** | **The prescribed remediation, described as a teaching plan** |
| Supporting detail | Per-kanji facts, as evidence beneath the diagnosis |
| Comment | One auto-generated line, instructor-editable |

```
reports.content = {
  diagnoses: [{ hypothesis, confidence, direction,
                evidence_kanji[], evidence_count,
                first_observed, trend: enum(improving, stable, worsening, new),
                prescription_summary, parent_text }],
  specific_facts: [...],
  insufficient_evidence: bool
}
```

Where no diagnosis clears threshold, the block renders honest language stating more practice records are needed — **never a fabricated finding.**

Vendor branding appears only as a single small footer line.

### 10.2 Containment assertion (MUST)

**Every generated sentence in the report — the comment line and any `parent_text` — MUST pass a deterministic containment check: it introduces no kanji, figure, date, or claim not present in the structured `diagnoses` object.**

Violations fail generation, not review. This closes the one place where LLM prose sits beside a confident diagnosis with only a human rubber-stamp between it and a parent.

### 10.3 Specificity constraint (MUST)

The report's commercial value is that it could not have been written about any other child.

- `specific_facts[]` MUST contain ≥5 entries, each referencing a concrete kanji, reading, or observed error
- Enforced by §15.1
- **Manual acceptance gate:** generate reports for 10 students in one branch, print, lay side by side. If a parent could swap any two without noticing, the feature does not ship

### 10.4 Mixed provenance (MUST)

Error data may originate from SENJI worksheets (`results`), manual entry, or diagnostics. **The report MUST render identically and meet §10.3 regardless of provenance mix** — including for a student whose entire profile came from diagnostics and manual entry. A juku using eトレ exclusively is a first-class case, not a degraded one.

Whether the report surfaces provenance to the parent is open (§19.6).

### 10.5 Delivery

- Monthly batch on the 1st, plus on-demand
- Instructor previews, may edit the comment line, exports PDF
- Batch export per branch (SHOULD)
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

*Ranges pending pilot validation (§19.5). Configuration, not hard-coded.*

- All features at all tiers. **No feature gating.** The report MUST NOT sit behind an upper tier
- Flat pricing; **no usage-based billing exposed to customers**
- **Fair use enforced against `corporate_number`, not `org_id`**
- Annual prepay at 10 months; renewals default to **April**
- **Trial:** free first month plus introductory discount via `trial_ends_at`, `discount_pct`, `discount_ends_at`. A trial is a state on a chosen tier, not a separate tier
- **MUST support 銀行振込 with 請求書 issuance.** Card optional
- Waivable 初期費用

### 11.2 診断テスト — diagnostic assessment (MUST)

Solves cold start **and** is the primary **owned** data source given practice may occur outside SENJI.

- ~30 items, adaptive across grade bands, ~15 minutes
- Items carry span role `diagnostic_probe` and deliberately probe above assumed grade
- Produces a complete report immediately from one sitting
- Seeds `error_profile` and `student_hypothesis_state`
- **Re-runnable on a recurring cadence** (monthly or termly, configurable); `diagnostics.cadence` distinguishes
- The free-trial artifact and sales demo
- **Deterministic scoring — no LLM**

### 11.3 Worksheet generation (MUST)

1. Select student → targets ranked by (a) active hypothesis prescriptions, (b) error profile weakness, (c) 漢検 target gap, (d) curriculum position; manual override available
2. Sheet type: 書き取り / 読み / 熟語 / 混合 / **contrastive** (default 混合)
3. **Diagnostic objective: probe / treat / mixed** (default mixed — mostly treatment with 1–2 probes, giving continuous diagnostic refresh at near-zero marginal cost)
4. Item count — configurable **8–20, default 12**, targeting 10–15 minutes
5. Generate → preview validated items with ruby per §9.6
6. **Per-item regenerate** (not whole-sheet)
7. Export worksheet + answer key PDFs

Presets (SHOULD): daily micro-practice 8–10 · standard 12–15 · diagnostic review 20–30.

Instructor burden is driven by items requiring manual attention, not raw count. Surface flagged-item count prominently; target 2–4.

Targeting fidelity computed and persisted. Where relaxation occurred, the preview MUST indicate which items are off-target.

**Held-out re-probe (MUST).** Probes re-testing an active hypothesis MUST select kanji *not* in that hypothesis's recent remediation set (§7A.9).

### 11.4 Manual error entry (MUST)

**Makes the §1 positioning truthful.** Without it an error profile can only come from SENJI worksheets, so "keep using your existing materials" would be false.

- Quick entry: select student → tap missed kanji → **record what the student wrote or said** → optionally specify reading and error kind → save
- **The response field is prompted, with skip.** Not required — a low-motivation flow should not be made stricter — but the UI makes clear that recording the response is what makes the entry worth making. §7A.3 quantifies this: with response text the entry weights 0.7; without, 0.2
- Optional `source_label` (`eトレ`, `学校テスト`, `漢検過去問`)
- Feeds `error_profile` and hypothesis inference on equal footing with graded results
- Target: **≤10s session setup plus ≤5s marginal per kanji**, measured against an 8-error fixture
- Available to instructors for assigned students

### 11.5 Grading (MUST)

- **The answer key screen IS the grading screen.** Not a separate flow
- Tap missed items. Target ≤20s for a full sheet
- **iPad touch-optimised:** large tap targets, no hover, no small checkboxes
- **Wrong-answer capture is semi-required for 書き取り items.** H3, H4, and H8 are *only* observable in production items and *only* if what was written is recorded. Marking an item wrong without recording the wrong character discards its entire diagnostic payload

Grading and manual entry are the two paths producing error data:
- Prompt when a worksheet is >48h old and ungraded
- Surface error-capture counts on manager and owner dashboards
- Track **error-data capture per student per month, any source** as the primary leading indicator

### 11.6 Branding (MUST)

Logo and `report_display_name` at branch level, inheriting org defaults.

### 11.7 Review queue (MUST)

Owner-accessible. Contains `REVIEW_REQUIRED` classifications, items failing behavioural verification repeatedly, and **candidate hypotheses awaiting V3 promotion review.** Displays span, context, classifier basis, and the frozen-table rule consulted. Resolutions: approve as-is, approve with ruby, discard, promote. Approved items enter the corpus.

**Never blocks live generation.** Queue depth instrumented; sustained depth above ceiling raises an alert — a queue growing faster than it drains means the classifier is miscalibrated, not that reviewers are slow.

### 11.8 Support architecture (MUST)

Deliberately simple. **No chatbot, no AI intent classification, no confidence-threshold routing, no automated escalation.**

**Tier 1 — Static FAQ** on the SENJI website. Plain content, no logic. Fixed always-visible prompt at the bottom: 「お探しの答えが見つかりませんでしたか？Chatworkでお問い合わせください」.

**Tier 2 — Chatwork (primary human channel).** A real team member replies directly. Chosen over phone because one operator serves multiple juku concurrently.

**Tier 3 — Published phone number, outsourced.** Answered by a third-party **電話代行**. Operators do not know the product and do not attempt resolution; their function is first-contact triage forwarded by email. Processed on the same cadence as written support. Budget ¥5,000–10,000/month (~40–50 calls).

**LINE公式アカウント explicitly rejected** and MUST NOT be built.

**Support hours (MUST)** stated accurately. Juku operate ~16:00–22:00 JST and Saturdays. **Where the 電話代行 provider's hours do not fully cover that window, the gap MUST be stated explicitly rather than implied to be full coverage.** Maintenance falls outside juku hours regardless.

### 11.9 Onboarding materials (MUST)

Two separate deliverables, both downloadable, neither replacing the other:
1. **Onboarding video**, Japanese, ~15 minutes
2. **導入マニュアル PDF** — a text-based practical manual, **not a transcript.** The Japanese SME market places high value on a written reference independent of video, and many users look for the PDF before watching anything

---

## 12. Screens and form factor

**Responsive web application.** **WON'T:** native mobile app in V1 — the core job terminates at a printer, browsers avoid install approval on locked-down juku PCs, one deploy target suits the team. **WON'T:** offline sync.

| # | Screen | Primary device |
|---|---|---|
| 1 | Login / password reset | Both |
| 2 | Owner dashboard — branches, error-capture, targeting fidelity, report status | PC |
| 3 | Branch & roster management | PC |
| 4 | **Student detail — hypothesis state, error map, provenance, history, 漢検 progress** | PC |
| 5 | Worksheet generation wizard (incl. diagnostic objective) | PC |
| 6 | Worksheet preview + per-item regenerate + off-target indicators | PC |
| 7 | **Answer key / grading (incl. wrong-answer capture)** | **iPad** |
| 8 | **Manual error entry** | **iPad** |
| 9 | Diagnostic administration & scoring | PC |
| 10 | Report preview, comment edit, export | PC |
| 11 | Batch report generation | PC |
| 12 | Review queue (owner only) | PC |
| 13 | Settings — branding, users, branches, `ruby_policy` | PC |
| 14 | Subscription & invoices | PC |
| 15 | Help centre — video, manual download, FAQ and Chatwork links | Both |

The public static FAQ is part of the marketing site, not the application.

---

## 13. Instrumentation

**Product health**
- Validation first-pass rate, per layer, per model
- Tier distribution across spans — shifts indicate classifier or curriculum drift
- Ruby application rate split by `reason` — detects `ruby_policy` misconfiguration
- **Blind-cloze admission rate** and **counterfactual rejection rate**, per hypothesis
- Review queue depth and drain rate
- Corpus cache hit rate (→ gross margin)
- Regeneration rate per item; generation and render latency

**Diagnostic health**
- **Hypothesis distribution** across the student population — an implausible distribution indicates a tagging defect
- **Confidence distribution** per hypothesis
- **Resolution rate** — proportion of `remediating` states reaching `resolved` on held-out re-probe. **This is the direct measure of whether remediation works**
- Candidate hypothesis proposal, admission, and promotion counts

**Personalization health (§1.1)**
- **Targeting fidelity** per worksheet, aggregated per branch
- **Target relaxation rate** per branch and student
- **Cohort overlap** between same-branch same-day worksheets
- **Error-data capture per student per month, any source** — primary leading indicator

**Commercial health**
- Reports generated / exported per branch per month
- Active students vs. tier cap, by `corporate_number`
- Token spend per org per month; trial → paid conversion

**Retention proof (from month 6)**
- 退塾率 among students receiving reports vs. those not

---

## 14. Non-functional requirements

| Area | Requirement |
|---|---|
| Generation latency | p95 < 15s per worksheet |
| PDF render | p95 < 5s (requires §9.8 warm container) |
| End-to-end task | Login → exported worksheet PDF < 90s, unaided |
| Manual error entry | ≤10s setup + ≤5s per kanji, 8-error fixture |
| Validation | First-pass rate > 92% by week 8 |
| Corpus | Cache hit > 50% by month 3, > 80% by month 6 |
| Targeting fidelity | ≥ 80% median |
| Blind-cloze verified item error rate | ≤ 5% (target 2–4%; measured Week 2) |
| Availability | 99% target; maintenance outside 15:00–23:00 JST and Saturdays |
| Browsers | Latest 2 versions of Chrome, Edge, Safari (incl. iPadOS Safari) |

---

## 15. Build gates

Seven build-breaking CI gates. Each exists because the corresponding failure is silent and reaches a customer before it reaches the team.

### 15.1 Specificity Gate

- Jaccard similarity of `specific_facts` < 0.5 between any two students in the same branch and period; `specific_facts.length >= 5`
- **A:** Jaccard < 0.5 over the union of `diagnoses[].evidence_kanji`. (Jaccard over hypothesis *labels* would falsely fail — two students may legitimately share a diagnosis from a set of nine)
- **B:** every report either carries ≥1 diagnosis above threshold **or** sets `insufficient_evidence: true`. A below-threshold finding rendered as confident fails the build
- **C:** §10.2 containment assertion passes on every generated sentence
- Fixtures include one student whose profile derives entirely from `manual_error_entries` and one entirely from diagnostics

### 15.2 PII Privacy Gate

Build fails if any field originating from `students`, `users`, `branches`, or `organizations` is reachable from the LLM client.

**MUST inspect the serialised outbound payload** at the §8.1 choke point — not type signatures, call sites, or intermediate objects.

**Extended to §7A.5:** assert the response allowlist filter is applied and that no `response_text` or `manual_error_entries` free-text reaches the payload unfiltered.

*Rationale: sales material states 生徒の個人情報は生成AIに送信しません. It must be literally true.*

### 15.3 Font Integrity Gate

Render a canary containing all 1,026 kyōiku kanji, the `allowed_with_ruby` extension set, full kana, permitted punctuation, ruby spans under each `ruby_policy`, and a proper-noun fixture including 髙 﨑 濵 邊. Parse the output PDF's font resource dictionary and assert **exactly one embedded font.**

Font-agnostic by design — passes on placeholder and licensed font alike. It verifies the *mechanism*, not the foundry.

### 15.4 Tenant Isolation Gate

Cross-tenant reads attempted at org, branch, and assignment scope, asserting failure. **Coverage MUST include every tenant table** — `user_branch_assignments` and `student_instructor_assignments` in scope and carrying RLS.

### 15.5 Classifier Determinism Gate

Run the regression set through §7.4 **and §7A.2** twice in the same build; assert byte-identical `reading_analysis` and `inferred_hypotheses` including span offsets, plus stability against a committed golden file.

**Regression set:** 今日, 明日, 大人, 一人, 一日, 二十日, 今年, 人気, 河原, 眼鏡, 生, and the 手紙 / 紙 rendaku pair.

*Rationale: non-deterministic classification makes the regression set meaningless and corrupts the corpus, since cached items carry `max_tier` and `discriminates` that may no longer reproduce.*

### 15.6 Targeting Fidelity Gate

Against fixture students with deliberately distinct error profiles and hypothesis states:
- **Targeting fidelity ≥ 80%**
- **Cross-student divergence** — overlap below the cohort threshold (default 20%)
- **Relaxation visible** — events appear in `relaxation_events` and are reflected in the persisted figure
- **Prescription match** — items generated for a student with an active hypothesis conform to that hypothesis's prescription template (§7A.4)

### 15.7 Clinical Language Gate

Assert no candidate hypothesis label, mechanism, or `parent_text` passes the §7A.5 content blocklist. Fixture set includes deliberately clinical-sounding candidate proposals; **all must be rejected.**

*Rationale: an open-ended reasoner examining a child's error history drifts toward clinical explanation. A parent report reading as a learning-disability assessment is a harm to the child and a liability for the juku.*

---

## 16. Security, privacy, compliance

### 16.1 Tenant isolation (MUST)

Row-level security on **every** tenant table keyed by `org_id`, with branch- and assignment-level scoping above it. Join and assignment tables are tenant tables and carry `org_id` and RLS. Covered by §15.4.

### 16.2 LLM data boundary (MUST)

**No student name, identifier, age, branch, or organisation is ever transmitted to any LLM provider.** Permitted outbound: grade, character sets, reading targets, item type, span role profile, topic hint, and — for §7A.5 only — **allowlist-filtered response strings**. Enforced by §15.2.

### 16.3 Data handling

- Personal data minimised. `students.display_name` may be an internal ID at the juku's discretion
- Retention: error profiles, hypothesis states, and reports retained while the subscription is active plus 90 days
- Export and deletion endpoints for departing customers
- 個人情報保護法 委託先 contract terms available on request
- **電話代行 provider is a 委託先 handling customer contact data.** A data-handling agreement is required before the number is published
- Audit log for report export, roster changes, permission changes, review-queue resolutions, and candidate hypothesis promotions
- Public site MUST carry プライバシーポリシー and 特定商取引法に基づく表記
- All customer-facing Japanese copy reviewed by a native speaker before publication (§19.10)

### 16.4 Font license compliance

- Font file never publicly reachable; single weight licensed and embedded
- Subsetting only within the scope confirmed in §19.1
- `fsType` verified against the delivered file at substitution time
- Placeholder font removed from all build targets before launch
- PDF permission flags may be set for contractual compliance. **They are trivially bypassed and are not a security control**

---

## 17. Stack and infrastructure

| Layer | Choice |
|---|---|
| Frontend / API | Next.js + TypeScript |
| Hosting (app) | Vercel |
| Database / Auth | Postgres (Supabase), RLS for tenancy |
| Morphology | SudachiPy + UniDic (MeCab / Juman++ acceptable alternates), containerised |
| Reading classifier (§7.4) | Deterministic over frozen tables. No LLM |
| **Hypothesis classifier (§7A)** | **Deterministic over frozen tables. No LLM** |
| Verification service (§7A.7) | Blind cloze / counterfactual; batch-oriented, latency-insensitive |
| **PDF rendering** | **Headless Chromium in a dedicated warm container. Not serverless** |
| LLM | Provider-abstracted; server-side only |
| Object storage | S3-compatible |
| Batch | Scheduled runner for month-end reports and corpus verification |
| CI | GitHub Actions — seven build gates plus the §6.5 hash workflow |
| Support | Static FAQ + Chatwork + third-party 電話代行. No chatbot infrastructure |

---

## 18. Milestones

Engineering deliverables and externally-owned dependencies tracked separately. A week is complete when its engineering deliverables are; external dependencies have their own owners and trigger dates and do not gate week completion.

### 18.1 Engineering deliverables

| Weeks | Deliverable |
|---|---|
| 1 | Repo, CI, environments. Curriculum ingestion + provenance manifest + §6.5 hash workflow. §7.5 span-role table frozen. **`target_reading_ids[]` landed in isolation, before any other §7A work** |
| 1–2 | Character table with §6.5 CI green. Reading-stage extraction, Grades 1–6 |
| 2 | §15.5 regression set. Junior-high/high-school readings, appendix words, normalisation, deduplication |
| **2** | **★ 200-item blind-cloze experiment.** Standalone script against the reading tables — **MUST NOT wait on the L1 pipeline.** ~1 engineering day + 3–4h native-speaker labelling. **Requires 10 同訓異字 sets in advance (§19.3).** Report measured rates against §7A.8's estimates; material divergence changes the H2/H3/H4/H8 build decision, not just its confidence |
| 3 | Generation + classification pipeline, CLI only. §7A tagging for **H1, H2, H3, H6, H7** — the group requiring no data asset beyond §6's schedule. Pass rate, tier distribution, hypothesis distribution, targeting fidelity reported |
| 3–4 | Blind-cloze and counterfactual verifiers; evidence weighting; `student_hypothesis_state` |
| **4** | **Concierge pilot — program gate. Unchanged and improved.** Pilot juku run the paper diagnostic; reports returned by email within 24h. No UI required |
| 5–6 | Rendering container, §15.3 green on placeholder. **Sprint 5 vertical smoke render.** Web UI: roster, generate, preview, export. H8 and H5 as their data assets land |
| 7 | Grading with structured wrong-answer capture; manual error entry; §15.6 green |
| 8 | Diagnosis-led report (§10.1), containment assertion (§10.2), §15.7, branding upload, batch export, review queue |
| 9 | Auth hardening, §15.4 green across all tenant tables, subscription + trial mechanics + 請求書 billing. **§15.2 extension green before the open path ships** |
| 9–10 | Support infrastructure; onboarding video and 導入マニュアル PDF. H4 remediation; HX open path |
| 10 | Pilot conversion to paid |

**Week 4 is the program gate and does not move.** If pilot 塾長 respond politely rather than asking to show the report to parents, stop and re-evaluate before further UI investment.

### 18.2 Externally-owned dependencies

| Item | Owner | Trigger |
|---|---|---|
| §19.1 Morisawa license | Founder | **Escalate if no substantive response by end of Week 3.** Blocks launch, not Sprint 3 |
| §19.3 同訓異字 sets (10 minimum) | Founder | **Before Week 2** — blocks the blind-cloze experiment |
| §19.3 Confusable pairs (IDS-assisted) | Founder | Before Week 5 |
| §19.3 連濁・音便 exemplars | Founder | Before Week 5 |
| §19.3 H4 golden set (~50 items) | Native speaker | Before Week 9 |
| §19.9 電話代行 provider | Founder | Before Week 9 |
| §19.10 Native-speaker reviewer (single role) | Being sourced | Before Week 9 |
| Pilot juku sourcing | Named owner, outside this workstream | Before Week 4 |

---

## 19. Open items

### 19.1 教科書体 server license — BLOCKS LAUNCH; does not block Sprint 3

Budget ¥250,000–300,000/year; single weight expected at the lower end. §15.3 is font-agnostic, so Sprints 3–6 proceed on a placeholder and substitution is a config change plus one verification round.

**Escalate if no substantive response by end of Week 3.** Confirm in writing: is subsetting within permitted scope (サブセット化して PDF に埋め込むことは許諾範囲に含まれるか); how is a "server" counted under container autoscaling; `fsType` bits on the delivered file; **does the weight include complete `vert`/`vrt2` tables and vertical metrics** (terms deferred to V1.1, but a negative answer should be known before signing a multi-year license).

### 19.2 Reading-stage and lexical tables — COMPLETE

Extraction from the MEXT 音訓割り振り表 and lexical exception curation, delivered Weeks 1–2. Retained here for provenance.

### 19.3 Domain assets — authoritative list, superseding all earlier estimates

| Asset | For | Status |
|---|---|---|
| **同訓異字 sets, grade-keyed** | H4 | **10 sets needed before Week 2.** Set membership only — the full context corpus is no longer required |
| **Confusable-pairs table** | H8 | IDS decomposition (CHISE / Unicode) generates candidates mechanically; human work is pruning |
| **同音異義語 sets, grade-keyed** | H3 | Derivable from reading tables by grouping; curation for what is taught |
| **連濁・音便 exemplar list** | H5 | Lyman's Law reduces but does not eliminate |
| **H4 golden set (~50 items)** | Verifier calibration | Native-speaker authored; measures the verifier, not the product corpus |
| **200-item experiment labels** | Week 2 experiment | 3–4h native-speaker time |
| 送り仮名の付け方 | H6 | **Public** — 内閣告示. Ingestion only |
| 常用漢字表 付表 | H7 | **Public.** Already ingested |

### 19.4 Vertical writing validation — decides V1.1 scope

V1 ships horizontal. Protocol: interview 5–8 pilot instructors with A/B printed samples. **Retain horizontal if** ≥70% accept horizontal kanji worksheets **and** ≥80% accept horizontal parent reports **and** no pilot juku names vertical as a pre-launch hard requirement. **Escalate to a hard blocker only if** ≥2 pilot juku state they will not use or pay without it **and** their core use case is kokugo reading, composition, or textbook-style printing.

### 19.5 Business inputs pending pilot validation

- Tier price points within §11.1 ranges
- Default worksheet item count (currently 12)
- `ruby_policy` default and the grade-3 boundary — show instructors sheets at each setting
- Average 月謝 in segment — elementary once-weekly individual tutoring runs ~¥10,000–18,000/month
- 漢検 group-exam posture, segmented three ways
- Whether the juku uses eトレ or equivalent, and what it charges students for it
- What the juku currently gives parents — replacing a workflow vs. creating one
- Decision authority. **First pilot segment: independently operated, 1–3 branches, 20–100 elementary students, owner still actively teaching**

Per §1.1, triaged by whether findings affect diagnostic depth or its legibility; pricing and packaging rank below both.

### 19.6 Report provenance display

Whether the report should surface that errors came from SENJI worksheets, diagnostics, or manual entry. Default: internal only.

### 19.7 Trial and fair-use edge cases beyond corporate_number

Sole proprietorships without a 法人番号; repeat trials under a new organisation by the same operator. Needs a decision before the Pilot tier goes public.

### 19.8 Diagnostic probe naturalness

Should `diagnostic_probe` bypass L4 naturalness as well as the grade gate? Current spec says no — but a probe deliberately using rare vocabulary may fail naturalness for the wrong reason.

### 19.9 電話代行 provider selection

Criteria: Japanese-language answering, email forwarding, coverage of juku hours or clear disclosure of the gap, willingness to execute a 委託先 agreement. Budget ¥5,000–10,000/month.

### 19.10 Native-speaker review — single role, being sourced

One person covers both obligations:
- **Pre-publication copy review** — website, product UI, FAQ, onboarding video and manual, sales materials
- **Recurring ~2–4 hours/month** — 10% spot review of behaviourally-verified items, weighted toward newly-covered hypothesis sets, decaying as empirical promotion accumulates

Sourcing is handled outside this workstream. Cadence for the copy review (one comprehensive pre-launch pass vs. ongoing) remains undecided.

### 19.11 Answer-key ruby

Should the answer key carry ruby on the revealed answer to assist the instructor? A rendering question about the answer-key document only — it does not change §7.6's suppression rule for the worksheet.

### 19.12 Tracked outside this document

Pilot juku sourcing has a named owner and channel. Recorded for completeness; no engineering action required.

---

## 20. Explicitly out of scope for V1

Stroke-order recognition or scoring · handwriting input · stroke-form error detection · student login · parent login · email delivery to parents · gamification · subjects other than kanji · native mobile app · offline mode · franchise 本部 hierarchy · vertical writing templates (V1.1) · **support chatbot** · **AI intent classification or confidence-threshold support routing** · **automated support escalation** · **LINE公式アカウント** · confidence intervals and adaptive probe sequencing (V1.1) · per-hypothesis mastery curves (V1.1) · analytics beyond §13 · usage-based customer billing · consumer-facing product

---

## 21. Definition of done

1. All **MUST** requirements implemented
2. Validation first-pass rate > 92% on a 200-item held-out evaluation set
3. **All seven build gates green** (§15): Specificity, PII Privacy, Font Integrity, Tenant Isolation, Classifier Determinism, Targeting Fidelity, Clinical Language
4. §15.2 verified to inspect the serialised outbound payload, including the §7A.5 allowlist filter
5. §15.4 verified to cover every tenant table including join and assignment tables
6. Manual 10-report side-by-side gate cleared (§10.3), including one report derived entirely from manual entry and one entirely from diagnostics
7. **Blind-cloze verified item error rate ≤ 5%**, measured against the §19.3 golden set
8. **Held-out re-probe demonstrated end to end** — a hypothesis reaching `remediating` and transitioning to `resolved` on kanji not practiced (§7A.9)
9. **Licensed 教科書体 embedded; placeholder font removed from every build target**; `fsType` and subset scope verified
10. Font load failure throws and aborts render, verified by fault injection
11. Proper-noun fixture set renders in the licensed font, no fallback
12. Ruby renders per RenderPlan and `ruby_policy`; no ruby over any `suppressed_span` at any tier or policy
13. Sprint 5 vertical smoke render completed and archived
14. Median targeting fidelity ≥ 80% across a representative sample
15. Login → exported worksheet PDF in < 90s by an instructor with no training
16. Grading of a full sheet in < 30s on iPad; manual error entry at ≤10s + ≤5s/kanji
17. 3 pilot juku using the system weekly without prompting
18. 請求書 issuance and trial-to-paid conversion working end to end
19. **Support live:** static FAQ populated, Chatwork published, 電話代行 contracted with 委託先 agreement executed and hours stated accurately
20. **Onboarding live:** Japanese video and separate 導入マニュアル PDF both produced and downloadable
