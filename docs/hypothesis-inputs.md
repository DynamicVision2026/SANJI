# Hypothesis evidence input contracts (H1–H9)

This document is the implementation boundary between the §7A hypothesis
definitions and `hypothesis_evidence`. It records where each classifier obtains
its inputs, whether one source event or an aggregate produces evidence, and the
stable identity used for idempotency. It does not authorize a missing schema,
asset, or classifier contract.

The repository still lacks the original full §7A.1–§7A.4 base text. The
entries below therefore combine the binding v2.4/v2.5 amendments with explicit
architect/coordinator rulings already recorded in Issues #18, #21, #23, #24,
and #25. Where those authorities do not identify a persisted input, this
document marks a gap instead of treating the semantic description as a data
contract.

## Shared rules

- Tenant-derived inputs are read under the `app.current_org` and
  `app.current_user` RLS context. Curriculum tables and committed assets are
  global reference data and contain no student PII.
- A row-derived classifier emits at most one evidence row for one result and
  hypothesis. Its stable `evidence_key` is `<results.id>:<hypothesis_id>` (for
  example, `550e8400-e29b-41d4-a716-446655440000:H2`). A mutable answer,
  classifier output, curriculum row number, or array order must never be part
  of that identity.
- An aggregate classifier uses the aggregate observation's database-enforced
  natural key. It must not manufacture a representative `results.id`.
- `results.source_kind` supplies the §11.4.1 source factor for row-derived
  evidence. `NULL` response text or `NULL` source kind produces no evidence;
  it does not produce a zero-weight row.
- Evidence insertion never changes `student_hypothesis_state` or creates or
  resolves a `state_recommendation`.

## H1 — non-recognition

**Status:** implemented for result-derived evidence.

- **Source fields:** `results.id`, `student_id`, `item_id`, `is_correct`,
  `wrong_answer_text`, `graded_at`, and `source_kind`; `students.org_id`,
  `branch_id`, and `grade`; `items.item_type`, `target_kanji`, and
  `answer_text`; and stage-eligible `kanji_reading_stage.kanji`,
  `reading_kana`, and `school_stage` rows for the target.
- **Cardinality:** row-derived; zero or one H1 evidence row per result.
- **Stable evidence key:** `<results.id>:H1`.
- **Known missing inputs:** a confirmed blank cannot yet be distinguished from
  a response that was not captured because `results` has no response-status
  field. H8 exclusion is unavailable until a human-admitted §6.7
  confusable-pairs asset exists. Elementary grade-specific reading availability
  is represented only by the coarse `elementary` stage in the current adapter
  (Issue #19).

## H2 — on/kun selection

**Status:** contract resolved; result-derived persistence is reviewed
separately from this document.

- **Source fields:** the same tenant/result/item fields as H1, including
  `items.target_reading_id`; the referenced target row and student-stage-
  eligible alternatives from `kanji_reading_stage.id`, `kanji`,
  `reading_kana`, `reading_type`, `school_stage`, and `source_page`.
- **Cardinality:** row-derived; zero or one H2 evidence row per result. Evidence
  exists only when the captured wrong reading is an eligible, source-backed
  reading of the same kanji with the opposite `reading_type`.
- **Stable evidence key:** `<results.id>:H2`.
- **Known missing inputs:** no H2-specific input is currently missing. The
  coarse elementary-stage limitation described for H1 also bounds H2 stage
  filtering until Issue #19 is resolved.

## H3 — homophone selection

**Status:** blocked input contract.

- **Required source fields:** tenant/result provenance as above; an item-level
  stable identifier for the intended homophone member; the captured response;
  a grade/stage-keyed 同音異義語 set derived from
  `kanji_reading_stage.reading_kana` and curated for taught membership; and the
  committed blind-cloze/counterfactual verification outcome required by
  §7A.7.
- **Cardinality:** intended to be row-derived; zero or one H3 evidence row per
  result.
- **Stable evidence key:** `<results.id>:H3` once the required item attribution
  exists.
- **Known missing inputs:** the repository has no admitted, queryable
  grade-keyed homophone-set asset and `items` has neither the specified
  `distractors`/`discriminates` fields nor a stable homophone-member identifier.
  Do not infer membership from mutable sentence text.
- **Resolution options:** (1) commit a provenance-bearing homophone-set asset
  with stable member IDs and add the selected member ID to the item contract;
  (2) add normalized `items.distractors` plus an immutable validation record
  that names the admitted set/version; or (3) leave H3 evidence disabled until
  both the curated set and item attribution land.

## H4 — same-reading, different-kanji selection

**Status:** blocked input contract.

- **Required source fields:** tenant/result provenance; captured response;
  item-level intended member and set identity; the grade-keyed 同訓異字 set;
  and its blind-cloze/counterfactual verification result. The set is distinct
  from free sentence context and from an LLM's declared intent.
- **Cardinality:** intended to be row-derived; zero or one H4 evidence row per
  result.
- **Stable evidence key:** `<results.id>:H4` once stable set/member attribution
  exists.
- **Known missing inputs:** no admitted grade-keyed 同訓異字 set, stable set or
  member identifier, item attribution, or H4 golden-set validation record is
  committed. The frozen disambiguation word-family files are not a substitute
  for this production contract.
- **Resolution options:** (1) commit a reviewed, versioned 同訓異字 asset with
  stable set/member IDs and persist those IDs on items; (2) authorize a
  normalized item-discriminator relation referencing that asset; or (3) keep
  H4 evidence disabled until the asset and behavioural verifier are both
  available.

## H5 — rendaku / sound alternation

**Status:** blocked source asset and input contract.

- **Required source fields:** tenant/result provenance; captured response and
  item target reading; source-backed base and alternated phonological forms;
  and the carrier's §7A.7 blind-cloze result. `lexical_reading_rule` is the
  specified curriculum-level source once the relevant rules exist.
- **Cardinality:** intended to be row-derived; zero or one H5 evidence row per
  result.
- **Stable evidence key:** `<results.id>:H5` once a stable rule reference exists.
- **Known missing inputs:** §19.2 remains open because curated rendaku rules
  were not delivered; no 音便 exemplar asset or stable H5 rule identifier is
  attached to an item. A base reading in `kanji_reading_stage` does not prove a
  voiced compound reading.
- **Resolution options:** (1) ingest a provenance-bearing rendaku/音便 rule
  asset into `lexical_reading_rule` with stable rule identifiers and reference
  one from each H5 item; (2) authorize a separate versioned phonological-rule
  asset and item relation; or (3) keep H5 evidence disabled until the source
  asset is delivered and reviewed.

## H6 — okurigana

**Status:** classifier asset correction is under separate review; persistence
remains blocked on item attribution.

- **Source fields:** tenant/result provenance; captured response;
  `items.target_kanji` and answer; and a reviewed okurigana rule containing a
  stable word-derived `id`, official-clause `clause_id`, accepted forms,
  rejected forms, and page/hash provenance.
- **Cardinality:** row-derived; zero or one H6 evidence row per result, only for
  an explicit rejected form of the attributed rule.
- **Stable evidence key:** `<results.id>:H6`.
- **Known missing inputs:** the current `items` schema does not name an H6 rule
  or official clause. The pilot asset must complete human review before it can
  become production authority. Inferring a rule from `answer_text` would make
  identity depend on mutable content.
- **Resolution options:** (1) after the asset is admitted, add a stable H6 rule
  reference to the item contract (recommended); (2) create a normalized
  item-to-okurigana-rule relation; or (3) defer H6 evidence persistence rather
  than infer a rule from answer text.

## H7 — jukujikun / compositional-reading confusion

**Status:** the H7 polarity inversion and reviewed `reading_variants` asset are
landed, including `rv-ashita` for 明日/あした.

- **Source fields:** tenant/result provenance; item surface and captured
  reading; valid whole-surface readings from `lexical_reading_rule.surface`,
  `reading_kana`, `rule_kind`, and `source_page`; a narrow, provenance-bearing
  `reading_variants` asset (`schema_version`, `snapshot_version`, and per-entry
  `variant_id`, `surface`, `reading_kana`, provenance, and verification fields)
  for valid readings not represented by that source;
  and the compositional concatenation set computed from each surface
  character's `kanji_reading_stage.kanji` and `reading_kana` rows.
- **Cardinality:** row-derived; zero or one H7 evidence row per result. H7 fires
  only on a positive match in the computed compositional set after valid
  whole-surface readings are accepted. An arbitrary non-matching response is
  not H7 evidence.
- **Stable evidence key:** `<results.id>:H7`. Curriculum database serial IDs,
  JSON array positions, and computed-reading order are not evidence identity.
- **Known missing inputs:** Issue #23 must land the polarity inversion and the
  reviewed `reading_variants` asset. Its initial stable semantic identifier is
  `rv-ashita` for 明日/あした; this ID, not its array position, is the variant's
  identity. Curated variants require reviewer/date;
  source-backed variants require page provenance. Ordinary component readings
  belong in `kanji_reading_stage`, not in the variant asset.

## H8 — visual confusion

**Status:** blocked on human admission and item attribution.

- **Required source fields:** tenant/result provenance; captured production
  response; item target and stable contrast-kanji pair identity; and an
  admitted, versioned §6.7 confusable-pairs snapshot containing pair members,
  decision, reviewer, review date, basis, generator/input versions, and the
  counterfactual/blind-cloze validation outcome.
- **Cardinality:** intended to be row-derived; zero or one H8 evidence row per
  result.
- **Stable evidence key:** `<results.id>:H8` once pair attribution exists.
- **Known missing inputs:** the repository snapshot is candidate-only and all
  pairs remain pending; it is not a production, queryable admitted-pair table.
  `items` also lacks the v2.5 `contrast_kanji`/snapshot reference. H8 cannot be
  inferred merely because a response happens to contain a visually similar
  character.
- **Resolution options:** (1) human-prune and commit a numbered admitted
  snapshot, then persist pair and snapshot IDs on items; (2) create a global
  admitted-pair table plus a normalized item reference; or (3) keep H8
  evidence disabled while candidate decisions remain pending.

## H9 — production–recognition asymmetry

**Status:** the aggregate-evidence persistence path is landed, but the upstream
`error_profile` accumulator for real modality/window/source-factor data is not
implemented, so the adapter is currently unfed.

- **Source fields:** student/tenant ownership and per-`(kanji, reading_id)`
  recognition and production attempts/correct counts from `error_profile`,
  constrained to a trailing evaluation window; the lowest §11.4.1 source
  factor among contributing observations; and
  `hypothesis_aggregate_observation.id`, `student_id`, `org_id`,
  `hypothesis_id`, `kanji`, nullable `reading_id`, `window_start`, `window_end`,
  `recognition_attempts`, `recognition_correct`, `production_attempts`,
  `production_correct`, `gap`, and `min_source_factor`.
- **Cardinality:** aggregate; at most one evidence event per
  `(student_id, kanji, reading_id, evaluation_window)`. Evaluate on report
  generation and on demand, not per grading event.
- **Stable evidence key:** the observation identity
  `(student_id, kanji, reading_id, window_start, hypothesis_id)`, enforced by
  the aggregate table's unique constraint (and the corresponding partial
  unique key without `reading_id` when it is `NULL`). The evidence-key string
  is `H9:<student_id>:<NFC-kanji>:<reading_id-or-none>:<window_start>`. It never
  contains a contributing result ID, window-end date, mutable count, accuracy,
  or threshold.
- **Current provisional policy:** trailing 60 days, at least five recognition
  and five production observations, accuracy gap at least 0.40, and
  `min_source_factor` equal to the lowest source factor among contributors.
  These values are placeholders pending Week 4 pilot calibration. H9 is
  expected to fire rarely in a student's first month and cannot fire for
  home-practice-only students because home practice supplies no production
  evidence.
- **Known missing inputs:** the authorized aggregate migration and evaluator
  must land before H9 evidence exists. In addition, the current
  `error_profile` placeholder has only undifferentiated `attempts`, `correct`,
  `last_seen_at`, and free-form `provenance`; it cannot yet supply modality-
  separated observations, trailing-window membership, or the minimum source
  factor. The aggregate evaluator may consume those totals once an accumulator
  has produced them, but must not pretend the current row already contains
  them. `hypothesis_evidence.source_type`
  distinguishes `result` from `aggregate`; aggregate evidence has
  `source_record_id = NULL` and references
  `aggregate_observation_id -> hypothesis_aggregate_observation` through the
  tenant/hypothesis-bound composite foreign key. A unique aggregate-observation
  index permits at most one evidence row for an aggregate.

## Implementation readiness summary

| Hypothesis | Cardinality | Input contract status |
|---|---|---|
| H1 | Row-derived | Implemented; bounded exclusions documented |
| H2 | Row-derived | Resolved |
| H3 | Row-derived | Blocked: curated set and item attribution missing |
| H4 | Row-derived | Blocked: reviewed set, attribution, and verifier missing |
| H5 | Row-derived | Blocked: rendaku/音便 source asset and rule attribution missing |
| H6 | Row-derived | Blocked: admitted rule asset and item rule reference missing |
| H7 | Row-derived | Issue #23 polarity/variant work must land first |
| H8 | Row-derived | Blocked: no admitted pair snapshot or item pair reference |
| H9 | Aggregate | Issue #25 aggregate schema/evaluator must land first |
