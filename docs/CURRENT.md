SENJI Spec - CURRENT status. Sources in merge order: spec-v2.3.md base, spec-v2.4.md amendments, spec-v2.5.md final amendments which win on any conflict.

Known gap: the separate section 7A base design document with the original H1-H9 hypothesis definitions was never supplied in full text. Only extensions to it exist in this repo, in sections 7A.5 through 7A.8. Locate that document before treating the hypothesis taxonomy as fully specified.

Key v2.5 outcomes superseding earlier drafts:
- Hypothesis state is tracked per student per hypothesis, not per student per kanji.
- All state transitions require explicit instructor approval; none are automatic.
- Image upload for guardian evidence submission was dropped from scope entirely, not deferred.
- Voice input is transcribed on the client device only; audio is never transmitted or persisted.
- Guardian accounts reverse an earlier exclusion of parent login by named decision; student login remains excluded.
- Total build gates across the spec: eight.

Implemented persistence foundation (migration 0010):
- Confirmed hypothesis state is stored once per student and H1–H9 hypothesis, with the five v2.5 enum values.
- Tenant-owned hypothesis evidence and recommendations carry explicit org, branch, and student ownership with composite foreign keys and Postgres RLS.
- Evidence insertion cannot mutate confirmed state. Direct status updates and direct recommendation resolution are rejected at the database layer.
- Explicit assigned-instructor approval is the only implemented transition operation; approvals and rejections create immutable, attributable audit records.
- Generation, recommendation production/superseding, runtime handlers, report integration, UI, and curriculum admission remain unimplemented.
- `src/results/record-result.ts` is the first internal production write path for one caller-graded `results` event. It validates tenant/student/worksheet/item/grader consistency under RLS in an explicit transaction and serializes identical concurrent events. It is not exposed by an API or UI; H1 processing remains a separate, explicitly invoked post-result operation.
- H1 alone has an internal result-to-evidence adapter. It requires a captured, unmatched wrong response and explicit `results.source_kind`; missing response or provenance produces no evidence. Yomi and kakitori discrimination factors are 1.0 and 0.5 respectively, multiplied by the §11.4.1 source factor. It inserts only `hypothesis_evidence`, never state or recommendations.
- H7 classification is closed-set: after whole-surface valid-reading resolution, it emits H7 only for an exact concatenation of component readings from `kanji_reading_stage`. Arbitrary wrong responses remain unclassified rather than becoming H7 by default. Valid readings absent from the frozen appendix extraction live in the separate, versioned `reading_variants.json` §6.7 asset with stable IDs and attributable review; 明日/あした is resolved there without falsely assigning it an appendix page.
- H9 is no longer a two-result pairing pilot. Its report-generation/on-demand adapter persists a closed aggregate observation and emits evidence only when recognition and production totals for the same student/kanji/reading/window clear both runtime-configured gates. Aggregate evidence has no result `source_record_id`, links to `hypothesis_aggregate_observation`, and cannot mutate state or recommendations.
- H9 now has an explicitly invoked accumulator that reads tenant-scoped `results`, treats `yomi` as recognition and `kakitori` as production, applies the runtime trailing window, excludes events without a known §11.4.1 source factor, and feeds the existing aggregate adapter. No report-generation caller exists.
- H2 has the same internal, explicitly invoked persistence boundary. A yomi result produces H2 evidence only when the unchanged `classifyOnKun` logic finds a source-backed opposite on/kun reading within the student's coarse stage. Unknown and same-type readings remain unclassified. The event weight is the §11.4.1 source factor; NULL response/provenance is skipped.
- Track A now has a minimal internal item path: PII-checked L1 text generation, conservative L2/L3 validation, L5 blocklist plus model verdict, deterministic H1/H2/H6/H7/H9-capability tagging, and a parameterized transactional `items` insert. Its live-Postgres test carries one captured real Codex output through item persistence, `recordResult` with explicit `source_kind`, and H1 evidence persistence. This is not the full §7 pipeline: it has no API/UI, corpus cache, behavioural verification, or above-stage carrier/ruby path.

Deliberate §0.1 deferrals and bounded limitations:
- Blank-confirmed versus response-not-captured remains indistinguishable until a future `results.response_status` and grading-UI decision; NULL is conservatively skipped.
- Option D aggregate/cross-item H1 evidence and Option A sentinel distractors remain deferred for dedicated design rather than being approximated here.
- H8 exclusion is not active: the repository has only a `PENDING_HUMAN_PRUNING` pilot snapshot, not a §6.7 admitted/queryable confusable-pairs table. H1 can therefore over-fire on H8-consistent responses until that asset exists.
- H9's defaults—five observations per side, a 0.40 accuracy gap, and a trailing 60-day window—are provisional Week 4 pilot-calibration values. The observation floor intentionally makes H9 uncommon in the first month and effectively unavailable from primarily home selected-response practice, which has no production evidence (§11.12); that absence is expected, not a defect.
- The H9 accumulator is available only through an explicit internal call. Report generation and its scheduled/on-demand trigger remain unimplemented.
- H2 exclusion uses coarse elementary/junior_high/high_school staging. Within-elementary differences can cause H1 to miss evidence it should count, a safe bounded false-negative for H1. Finer reading staging is tracked in Issue #19.
- Issue #21 gaps still block H6/H7/H9 persistence: H6 rules remain pending human review and items carry no approved rule ID; H7 lacks a discriminator for character-by-character readings and has a documented 明日/あした false positive; H9 lacks an approved result-pair scope plus two-result provenance/weighting semantics.
