# Hypothesis required-input audit (H1–H9)

This is the implementation boundary between `docs/spec-v2.5.md` §7A and
`hypothesis_evidence`. It audits the schema on `main` after PR #41. A
defined input shape is not treated as implemented unless a `src/` producer
actually populates it. This document authorizes no schema, asset, classifier,
or persistence change.

Status terms:

- **contract-complete**: every derivation term has an exact stable location,
  identity, and cardinality;
- **producer-complete**: real application code populates every required input;
- **blocked**: a required location, admitted asset, or producer is absent.

## Shared physical contract

- Row-derived H1–H8 evidence is zero or one row per result/hypothesis. Its
  immutable key is `<results.id>:<hypothesis_id>`. Mutable answer text,
  asset row order, JSON array index, and classifier output are never identity.
- H9 is aggregate. Its observation identity is
  `(student_id, kanji, reading_id, window_start, hypothesis_id)`, with the
  migration's partial unique key when `reading_id IS NULL`.
- A captured wrong response is `results.wrong_answer_text`; correctness is
  `results.is_correct`; time is `results.graded_at`; provenance category is
  nullable `results.source_kind`. `recordResult` writes the first three but
  has no `sourceKind` input, so leaves `source_kind` null. PR #38 proposes
  that producer change but is not on `main` at this audit.
- Current `items` has `item_type`, `target_kanji`,
  `target_reading_id`, `answer_text`, `body_text`,
  `validation_status`, and `validation_report`. It does not have the spec
  sketch's `distractors`, `discriminates`, or `verification`, nor H6/H7's
  authorized `okurigana_rule_id` and `lexical_surface`. PR #39 proposes
  the latter columns but is not on `main`.
- Student stage is derived from `students.grade`; ownership is
  `students.org_id` and `students.branch_id`. Tenant reads/writes use the
  existing transaction-local `app.current_org` and `app.current_user` GUCs.
- `manual_error_entries` has no response text, item, modality, or source
  factor, and no `src/` producer. It cannot substitute for a result event.
- Null response or null source kind emits no row, not zero-weight evidence.
  Evidence writers never mutate `student_hypothesis_state` or
  `state_recommendation`.
- No production item-generation/`items` insertion path exists in `src/`.
  Pilot fixtures prove classifiers, not production producers.

## Summary

| Hypothesis | Cardinality | Derivation contract | Producer on `main` | Blocking condition |
|---|---|---|---|---|
| H1 | Row | Bounded/incomplete | Partial | source kind, confirmed blank, H8 exclusion |
| H2 | Row | **Complete** | Partial | no item producer/caller; source kind unwritten |
| H3 | Row | Incomplete | Missing | admitted set and item attribution |
| H4 | Row | Incomplete | Missing | reviewed curation and item attribution |
| H5 | Row | Incomplete | Missing | alternation asset and rule attribution |
| H6 | Row | Approved follow-up not landed | Missing | asset pending; item field/producer/adapter |
| H7 | Row | Approved follow-up not landed | Missing | item field/producer/adapter |
| H8 | Row | Incomplete | Missing | admitted pair snapshot and attribution |
| H9 | Aggregate | Complete at adapter boundary | Missing upstream | no accumulator or caller |

H2 is the only hypothesis whose classifier derivation has an exact location
and identity for every term today. It is not end-to-end ready: item generation,
the result-to-H2 caller, and a merged source-kind producer remain absent. Thus
the architect's “H2 likely passes” statement is confirmed for input-contract
completeness, not runtime integration. No hypothesis is producer-complete.

## H1 — non-recognition

| Term | Exact source | Producer status |
|---|---|---|
| event identity | `results.id`, `item_id`, `student_id` | `recordResult` exists |
| wrong/nonblank response | `results.is_correct`, `wrong_answer_text` | writer exists; null cannot distinguish confirmed blank from uncaptured |
| time/source factor | `results.graded_at`, `source_kind` | time written; source kind not written |
| target/expected form | `items.item_type`, `target_kanji`, `answer_text` | fields exist; no item writer |
| stage/tenant | `students.grade`, `org_id`, `branch_id` | student persistence exists |
| H2 exclusion | `kanji_reading_stage.kanji`, `reading_kana`, `school_stage` | admitted curriculum |
| H8 exclusion | admitted confusable pair containing target/response | no admitted asset/table |

The merged `persistH1Evidence` reads these fields and uses the coarse
elementary/junior-high/high-school mapping approved in Issue #19, but no
production event path calls it.

- **Cardinality/key:** row-derived; `<results.id>:H1`.
- **Item fields:** `item_type`, `target_kanji`, and `answer_text` exist.
- **Asset gate:** reading-stage data is admitted; H8 exclusion remains bounded
  until a human-admitted §6.7 pair asset exists.
- **Gaps:** source-kind producer, confirmed-blank representation, H8 exclusion,
  item producer, and result-event caller.

## H2 — on/kun substitution

| Term | Exact source | Producer status |
|---|---|---|
| target character/reading | `items.target_kanji`, `target_reading_id` → `kanji_reading_stage.id`, `reading_kana`, `reading_type` | fields exist; no item writer |
| observed reading | `results.wrong_answer_text` | `recordResult` exists |
| eligible opposite readings | `kanji_reading_stage.kanji`, `reading_kana`, `reading_type`, `school_stage`, `source_page` | admitted curriculum |
| stage/tenant | `students.grade`, `org_id`, `branch_id` | exists |
| source factor | `results.source_kind` | column exists; merged writer omits it |

The classifier accepts only a source-backed reading of the same kanji with the
opposite `reading_type`; arbitrary wrong text is unclassified.

- **Cardinality/key:** row-derived; `<results.id>:H2`.
- **Item fields:** all classifier item fields exist.
- **Asset gate:** `kanji_reading_stage` is admitted; no curated set required.
- **Audit result:** **contract-complete**, uniquely among H1–H9. The committed
  pilot verifier is not a production item writer or persistence caller.

## H3 — homophone selection

H3 is a kakitori response selecting another member of a taught on-reading
homophone set.

| Term | Exact source | Producer status |
|---|---|---|
| result/response | standard row fields: `results.id`, `item_id`, `student_id`, `is_correct`, `wrong_answer_text`, `graded_at`, `source_kind` | partial; source kind absent |
| target seed | `items.target_kanji`, `target_reading_id` → reading-stage row | fields exist; no item writer |
| candidates | group `kanji_reading_stage` by normalized `reading_kana`, retain `reading_type='on'`, filter by stage | mechanically derivable; no admitted set/materializer |
| item set/member | **UNRESOLVED** exact item column/relation | missing |
| verification | §7A.7 blind-cloze/counterfactual result; spec sketches `items.verification` | column/producer absent |

- **Cardinality/key:** row-derived; `<results.id>:H3`.
- **Stable asset identity:** member `(set_id, kanji, reading_kana)`, never row
  order or array index.
- **Asset gate:** versioned taught-membership set admitted after mechanical
  grouping/pruning.
- **Contract options:** immutable item set/member columns; a normalized
  item-to-member relation; or typed discriminator JSON storing the stable tuple
  and admitted snapshot. This audit does not choose.

## H4 — same-kun-reading kanji selection

H4 cannot be safely generated by reading grouping alone: its distinctions are
semantic and require original §6.7 curation.

| Term | Exact source | Producer status |
|---|---|---|
| result/response | same row fields as H3 | partial |
| target | `items.target_kanji`, `target_reading_id` | fields exist; no writer |
| semantic set | proposed §6.2 `dokun_set(set_id, kanji, reading_kana, semantic_note_ja, min_grade)` | no asset/table/curator path |
| item set/member | **UNRESOLVED** exact item column/relation | missing |
| verification | §7A.7 blind-cloze/counterfactual result | no `items.verification` producer |

- **Cardinality/key:** row-derived; `<results.id>:H4`.
- **Stable identity:** generated `set_id`, immutable once assigned and never
  derived from editable `semantic_note_ja`; members use stable set/kanji/reading.
- **Asset gate:** named-human-reviewed §6.7 original curation.
- **Contract options:** item `dokun_set_id` plus member; normalized relation;
  or typed discriminator JSON referencing an admitted snapshot.
- **Sequencing:** H4 must follow H3 and H5, not be batched with them, because
  its source is original curation rather than mechanical derivation.

## H5 — rendaku / sound alternation

Lyman's Law can reject impossible candidates and assist generation from
component readings, but cannot prove that a lexical surface undergoes rendaku
or another alternation.

| Term | Exact source | Producer status |
|---|---|---|
| result/observed reading | standard row fields | partial |
| target surface/answer | `items.answer_text`, `target_reading_id`; no dedicated current surface field | no item writer; surface unresolved |
| components | `kanji_reading_stage.kanji`, `reading_kana`, `reading_type` | admitted |
| alternation | proposed §6.2 `phono_alternation(surface, component_readings, surface_reading, alternation, min_grade)` | no admitted asset/materializer |
| item rule | **UNRESOLVED** exact item field/relation | missing |
| carrier verification | §7A.7 blind-cloze result | no `items.verification` producer |

- **Cardinality/key:** row-derived; `<results.id>:H5`.
- **Stable identity:** `(alternation_type, exemplar_surface)`, never position.
- **Asset gate:** generated candidates require source or human review. Lyman's
  Law is a partial generator, not admission. Rendaku delivery in §19.2 remains
  incomplete.
- **Contract options:** immutable H5 rule key on items; normalized item/rule
  relation; or typed discriminator JSON with stable tuple and snapshot.

## H6 — okurigana

| Term | Exact source | Producer status |
|---|---|---|
| result/response | standard row-derived result fields | partial |
| attributed rule | authorized `items.okurigana_rule_id`, keyed to official clause plus inflection family | PR #39 open; no producer |
| decision | `okurigana_pilot.json.rules[].id`, `clause_id`, `accepted_forms`, `rejected_forms` | classifier exists |
| admission | asset `source_sha256`, `source_url`, `verification_status`; rule `source_page`, `basis` | `PENDING_HUMAN_REVIEW` |

- **Cardinality/key:** row-derived; `<results.id>:H6`.
- **Item fields:** `target_kanji` and `answer_text` exist but cannot replace
  immutable rule attribution; inference from sentence/answer text is forbidden.
- **Asset gate:** separate named-human §19.10 sign-off is mandatory.
- **Gaps:** authorized column not merged, no item producer, no adapter/caller,
  and asset pending.

## H7 — jukujikun / compositional confusion

| Term | Exact source | Producer status |
|---|---|---|
| result/reading | standard row-derived result fields | partial |
| lexical surface | authorized `items.lexical_surface` | PR #39 open; no producer |
| source readings | `lexical_reading_rule.surface`, `reading_kana`, `rule_kind`, `source_page` | admitted |
| valid variants | `reading_variants.variants[].variant_id`, `surface`, `reading_kana`, provenance/frozen verification | `rv-ashita` landed |
| compositional set | per-character `kanji_reading_stage.kanji`, `reading_kana` concatenations | classifier computes at query time |

H7 fires only on a positive compositional match after valid whole-surface
readings and variants are accepted. 明日/あした must not emit H7 evidence.

- **Cardinality/key:** row-derived; `<results.id>:H7`; variants use
  `variant_id`, never array position.
- **Asset gate:** lexical rules and reading variants are admitted.
- **Gaps:** item surface column not merged and no producer, adapter, or caller.

## H8 — visual confusion

| Term | Exact source | Producer status |
|---|---|---|
| production response | standard result fields; only production item types qualify | partial |
| target | `items.target_kanji` | exists; no writer |
| pair/snapshot | §6.7 canonical `(kanji_a, kanji_b)` plus `snapshot_version`; item location is **UNRESOLVED** | candidate pilots only |
| admission | decision, reviewer/date, basis, generator/input versions, and behavioral result | all candidates pending |

- **Cardinality/key:** row-derived; `<results.id>:H8`.
- **Stable asset identity:** `(snapshot_version, canonical kanji_a,
  canonical kanji_b)`; score and order are not identity.
- **Asset gate:** named-human-admitted, queryable §6.7 snapshot.
- **Contract options:** pair/snapshot columns on items; normalized item-to-pair
  relation; or typed discriminator record with the stable tuple. No admission
  producer, attribution producer, adapter, or runtime path exists.

## H9 — production/recognition asymmetry

| Term | Exact source | Producer status |
|---|---|---|
| modality | `items.item_type` via `results.item_id` (`yomi` recognition, `kakitori` production) | rows exist; no accumulator |
| correctness/time/factor | `results.is_correct`, `graded_at`, `source_kind` | source kind unwritten |
| target | `items.target_kanji`, `target_reading_id` | fields exist; no item writer |
| tenant/student | `students.id`, `org_id`, `branch_id` | exists |
| aggregate | `hypothesis_aggregate_observation` ownership, hypothesis, kanji/reading, window, modality counts, gap, `min_source_factor` | table/adapter landed; no accumulator |

- **Cardinality/key:** aggregate; one event per
  `(student_id, kanji, reading_id, window_start, hypothesis_id)`. Evidence
  has `source_type='aggregate'`, null `source_record_id`, and the observation
  FK. String key:
  `H9:<student_id>:<NFC-kanji>:<reading_id-or-none>:<window_start>`.
- **Policy:** provisional trailing 60 days, at least five observations per
  modality, gap ≥0.40, and lowest contributing §11.4.1 factor. Evaluate on
  report generation or demand, never per grading event.
- **Asset gate:** none beyond admitted curriculum reading identity.
- **Gaps:** `error_profile` has only combined attempts/correct and lacks
  modality, window, and minimum factor; no accumulator reads results; no
  report/on-demand caller exists; source kind is unwritten. The adapter is
  therefore unfed.

## Decisions required before implementation resumes

Architecture must select item attribution for H3, H4, H5, and H8 before their
classifiers or adapters are built. Production work must also add item writers
and source-kind capture; otherwise even contract-complete H2 has no live input
path. H3 and H5 may proceed after their attribution/asset contracts are
decided. H4 remains last because its reviewed original curation is not
mechanically derivable.
