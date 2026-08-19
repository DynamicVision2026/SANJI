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
- `src/results/record-result.ts` is the first internal production write path for one caller-graded `results` event. It validates tenant/student/worksheet/item/grader consistency under RLS in an explicit transaction and serializes identical concurrent events. It is not exposed by an API or UI and is not wired to any hypothesis logic.
