# Spec v2.5 — Amendment Set

Merges into: v2.3 + v2.4
Status: Final binding language, resolved through founder/architect review cycle following v2.4.
Origin: this amendment set was produced through a structured review conversation between the founder and the architect. Conflicts with existing v2.4 mechanisms were surfaced before language was finalised; each is recorded below alongside its resolution.

## Part 0 — Conflicts identified and resolved before final language

### 0.1 Train-car / hypothesis-state granularity — RESOLVED: per (student, hypothesis)

The five-state visualization and the teacher-confirmation mechanism (§0.3 below) are coupled: the granularity of the state model determines whether the confirmation mechanism is operable at all.

| Granularity | States per student | Lifetime transitions per student | 40-student branch |
|---|---|---|---|
| Per (student, kanji-reading) | ~200–1,026 | up to ~800 | tens of thousands of to-do items — unworkable |
| Per (student, hypothesis) | 9 + candidates | ≤36 | ~1,400 lifetime, single-digit weekly — viable |

Decision: state is per (student, hypothesis). One car per hypothesis under observation, not one per character.

Second, independent reason: §1 records as a formal framing defect (§0.1 of v2.4) that v2.3's product definition was satisfiable by per-kanji tracking. A per-character progress visualization as the primary UI metaphor would re-anchor teachers, parents, and the build team on exactly that model. What the train-car makes visible is what kind of failure a child has and where it stands — not how many characters are green.

### 0.2 Guardian/student self-upload and PII scope — RESOLVED across several rounds

Initial proposal (student self-upload of photographed worksheets) conflicted directly with two existing constraints:

- **§20** lists student login as explicitly out of scope for V1. Any self-upload mechanism requires an account holder.
- **§16.2** prohibits transmitting any student name to an LLM provider. A photographed worksheet routinely contains a handwritten name in the answer region, which is orthographically indistinguishable from legitimate kanji content — no automated name-detector can reliably separate the two.

Final resolution, reached after multiple rounds:

1. Student self-login is NOT built. §20's exclusion stands.
2. A **guardian account** is introduced instead (§11.11) — this is a new, deliberately-scoped decision, not an incidental side effect.
3. **Image upload is dropped from scope entirely** — not deferred, not backlogged. A photographed worksheet carries two independent problems: the PII/name-detection problem above, and a second, independent problem — it drags in a third-party correctness key, distractor structure, and answer key that SENJI does not own when the source material is juku-external. No pre-check layer solves the second problem.
4. Guardian input is **typed text or voice only**. Voice is transcribed **client-side**; the audio is never uploaded, transmitted, or persisted (§11.14.1) — because a voice recording is itself a biometric identifier under 個人情報保護法, independent of its content, and unlike text or a cropped image, there is no redaction that removes identity from speech. Client-side transcription reduces voice to a microphone affordance on a text field; §16.2 requires no amendment.
5. Free-text and voice feedback are **contextual annotation only** — never evidence, never entering §7A.3 accumulation, never justifying a `state_recommendation` alone. Attribution to a hypothesis is selected by the guardian or left unattributed — never inferred by an LLM (deterministic kanji-match attribution is disabled for voice specifically, because Japanese ASR resolves homophones arbitrarily, e.g. はやい → 早い or 速い with no principled basis — exactly the distinction H4 exists to diagnose).

Net effect: §16.2 stays **unamended**. §16.3 does not need image-retention or image-consent clauses. The customer-facing statement 生徒の個人情報は生成AIに送信しません remains accurate and does not require revision (§19.13 closed rather than pending).

### 0.3 Teacher confirmation of state transitions — RESOLVED: recommend-only AI authority

Decision: the system never autonomously changes a student's hypothesis state. Crossing a §7A.8 confirmation threshold produces a **recommendation**, never a state change. The decision authority belongs exclusively to the instructor.

This generalises the pattern already present in v2.4 §7A.5 (V3 cross-student recurrence is "flagged for human review," not auto-promoted) to apply uniformly across every transition, in both directions, including regressions.

Mechanism: a to-do list with three terminal states — approve (state changes), reject (state unchanged, logged as an explicit override — a meaningful signal, not a non-event), or no action (state unchanged, remains pending indefinitely). **No auto-expiry, no auto-approval, no timeout-based default resolution of any kind** — any system-side default reintroduces the autonomous-decision problem this mechanism exists to prevent. "Pending" and "rejected" produce the same visible outcome but must be distinguishable in the record.

Rejections are human-facing calibration signal only, reviewed by a person, and never used to auto-tune thresholds or weights — auto-tuning on rejection data would restore autonomous adaptation through a side door.

Consequence for DoD #8: the original criterion ("demonstrate a hypothesis transitioning remediating → resolved") is no longer a system property, since the transition now requires a human. Restated: demonstrate that the system emits a correct resolved_provisional recommendation, with legible basis, when held-out re-probe evidence clears threshold — and that no state change occurs absent approval.

### 0.4 Home-practice grading — RESOLVED: selected-response, not auto-grading

An early draft described parent-triggered home worksheets as using "the existing generation-and-auto-grading pipeline." No auto-grading pipeline exists — §11.5 defines grading as instructor tap-to-grade against the answer key. For home practice, the loop closes via **selected-response format**: items ship with their distractors visible as tappable options, and grading is deterministic — no human, no image, no new diagnostic machinery, using the same distractor-to-hypothesis binding that already exists (§7A.2).

Consequence: home practice cannot generate H9 evidence (production–recognition asymmetry) or reliable H3/H4/H6/H8 evidence, all of which require production items. Home practice is a legitimate but diagnostically narrower channel; the report must not present it as equivalent to classroom practice.

## Part 1 — H8 confirmed in scope, resequenced ahead of H4

H8 (visual confusion) lands before H4, not level with it. H8's prescription (minimal pairs against a named confusable neighbour) is deterministically verifiable by counterfactual substitution; H4's requires semantic forcing that no verifier can check as cleanly. Placing them on the same footing would delay the easier of the two behind the harder.

| Weeks | H8 work |
|---|---|
| 3 | IDS candidate generation script; pruning workflow ready for founder review |
| 5–6 | H8 detection + contrast_kanji in the request contract + counterfactual verification |
| 9–10 | H4 (unchanged) |

Dependency: the confusable-pairs table must be pruned and committed before Week 5.

### §6.7 Derived data assets (new)

Some curriculum assets have no authoritative published source and are produced algorithmically with human pruning. confusable_pairs is the first such asset. These follow a distinct provenance discipline from §6.1's source-document rule:

- Generation is reproducible. The generating algorithm, its version, and its input data version are committed. Re-running the generator on the same inputs MUST produce the same candidate set.
- Pruning is recorded, not inferred. Every admitted and rejected pair records the reviewer identity, the decision date, and the basis (shared_component, stroke_proximity, curated). Rejections are retained.
- Versioned snapshots, not a frozen checksum. Derived assets grow; §6.5's frozen-set checksum does not apply. Each release is a numbered snapshot; CI asserts snapshot integrity and that no committed pair lacks a reviewer.
- Items reference the snapshot version used at construction, so a later pruning decision does not silently invalidate persisted distractors.

## Part 2 — Five-state hypothesis model

### §7A.1 (amended) — Five-state model

`student_hypothesis_state.status` is a five-value enum. State is per (student, hypothesis). Per-kanji state is not modelled — `error_profile` continues to serve per-character mastery and is a separate concern.

| Train-car state | Enum value | Meaning |
|---|---|---|
| (placeholder — §19.10 native-speaker review) | undetected | No evidence, or evidence below threshold. Renders no car |
| (placeholder) | active | Confirmed pattern; evidence above threshold |
| (placeholder) | remediating | Matched remediation in progress |
| (placeholder) | resolved_provisional | Cleared once on held-out re-probe |
| (placeholder) | resolved_stable | Cleared on ≥2 successive held-out re-probes |

Japanese display labels are placeholders pending §19.10 native-speaker review. The candidate set 初識 / 混淆 / 糾正 / 鞏固 / 精準 explored during drafting is explicitly rejected as a candidate — it reads as Chinese, not natural Japanese, and would land poorly with 塾長 and parents. Engineering binds to the enum, never to display strings.

`watching` (from v2.4 drafting) becomes an internal sub-state of `undetected`, rendering no car. A hypothesis under observation but below threshold is not shown to any user as a finding.

### §7A.8 (amended) — Thresholds produce recommendations, not transitions

Crossing a confirmation threshold produces a state-change recommendation, never a state change. `status` is modified only by an explicit instructor action recorded in `state_recommendation`. This applies to every transition in both directions, including `resolved_provisional → resolved_stable` and regressions. No threshold, elapsed time, evidence volume, or confidence value changes a student's state without a human decision.

§7A.5's HX `reportable` stage becomes `recommendable` — a validated candidate produces a recommendation like any other.

### state_recommendation (new table)

```
state_recommendation
  id uuid pk, student_id fk, org_id fk, branch_id fk,
  hypothesis_id fk,
  from_status enum, to_status enum,
  basis jsonb,                  -- evidence ids, weighted sum, confidence,
                                 -- held-out probe result, trend window
  recommended_at timestamptz,
  resolution enum(pending, approved, rejected) DEFAULT 'pending',
  resolved_by_user_id fk nullable, resolved_at timestamptz nullable,
  rejection_note text nullable,
  superseded_by uuid nullable
  INDEX (branch_id, resolution) WHERE resolution = 'pending'
```

`basis` is populated deterministically from §7A.3 accumulation and must be legible to the instructor — evidence kanji, occurrence count, held-out probe outcome, not a bare confidence number.

### §11.10 State-change recommendations (new, MUST)

Instructors resolve recommendations for their assigned students; 教室長 and オーナー see all within scope.

| Action | Resulting state | Record |
|---|---|---|
| Approve | Changes to recommended status | Confirmed transition; resolved_by_user_id, resolved_at |
| Reject | Unchanged | Explicit override; optional rejection_note |
| No action | Unchanged | Remains pending indefinitely |

Hard constraints (MUST):

- No auto-expiry, no auto-approval, no timeout-based default resolution of any kind.
- `pending` and `rejected` produce the same visible outcome but MUST be distinguishable in the record.
- Rejections are never used to automatically adjust thresholds, weights, or model behaviour. They are surfaced to humans as calibration signal (§13) and acted on by humans.

Placement: the to-do list is a first-class surface on owner and instructor dashboards, with pending count badged. It also appears inline in the report generation flow (§10.6).

### §11.10.1 Superseding (new)

Where new evidence would generate a recommendation whose `from_status` does not match the current confirmed state, the system MUST NOT queue a second conflicting item. It updates the pending recommendation's `basis` in place and records the prior version via `superseded_by`. A student never has more than one pending recommendation per hypothesis.

### §12.1 Student progress visualization (new)

The five-state train-car visualization is a rendering layer over `student_hypothesis_state.status`. It MUST NOT compute, infer, aggregate, or threshold. Given a student it renders one car per hypothesis whose state is not `undetected`, coloured by status, in a fixed hypothesis order.

Binding constraints:

- No aggregation across hypotheses into a single composite score.
- No time-based or volume-based colour changes computed at render time. The state model is the sole authority.
- A hypothesis in `undetected` renders no car.
- Pending recommendations render as a distinct affordance adjacent to the car, never as a colour change. A recommended-but-unconfirmed state MUST be visually distinguishable from a confirmed one.

Independence: this component depends only on the status enum and the hypothesis list. It can be designed and built before H4 or H8 detection exists, against fixture state.

### §10.6 Pending recommendations at report generation (new, MUST)

Before a report is generated for a student, any pending `state_recommendation` for that student is surfaced in the generation flow with approve and reject affordances. The instructor may proceed without resolving.

The report always renders confirmed state. A pending recommendation MUST NOT influence report content, wording, or trend. Where a report is generated with unresolved pending recommendations, this is recorded on the report row for audit — not surfaced to the parent.

### §15.6 (amended) and §15.8 Recommendation Integrity Gate (new)

§15.6 additionally asserts that no code path writes `student_hypothesis_state.status` except the recommendation-approval handler. Fixtures attempt state writes from the evidence accumulator, the report generator, and the diagnostic scorer; all must fail.

§15.8 asserts:

- Crossing a §7A.8 threshold produces a `state_recommendation` and leaves `status` unchanged.
- A pending recommendation never resolves without a `resolved_by_user_id` — including under simulated clock advance of ≥1 year.
- Conflicting recommendations supersede rather than accumulate (§11.10.1).
- Rejections do not alter thresholds, weights, or basis computation for subsequent recommendations.

Total gates: eight (v2.4's seven, plus §15.8). §15.9 (a submission pre-check gate considered during the image-upload discussion) is explicitly NOT written — image upload was dropped from scope, not merely deferred.

### DoD #8 (restated)

Demonstrate that the system emits a correct `resolved_provisional` recommendation, with legible basis, when held-out re-probe evidence clears threshold — and that no state change occurs absent approval.

### §13 additions — instrumentation

Pending recommendation count and age distribution, per branch and instructor. Approval / rejection / pending ratio per hypothesis — a hypothesis rejected at a consistently high rate indicates threshold miscalibration and is reviewed by a human, never auto-adjusted. Median time-to-resolution.

Recorded design intent: this data supports a future manager-facing engagement view. Not a V1/v2.5 feature — named here so the audit trail supports it later without rework.

## Part 3 — Entry-path parity (instructor and guardian, evidentiary paths)

### §11.4.1 Entry-path parity (amended)

Error evidence enters through three paths — instructor manual entry, guardian submission, and home selected-response practice. All feed the identical pipeline; none may write to `student_hypothesis_state` directly. Hypothesis attribution runs exclusively through §7A.2 derivation and §7A.3 weighted accumulation.

`source_factor` (§7A.3) is determined by evidence quality, not by who supplied it:

| Source | Factor |
|---|---|
| Probe item | 1.0 |
| Targeted practice, supervised | 0.7 |
| Manual entry with response text (any role) | 0.7 |
| Incidental item | 0.4 |
| Home unsupervised selected-response | 0.4 |
| Manual entry without response text (any role) | 0.2 |

Instructor entry and guardian entry at equal evidence quality weight identically. The differentiator is whether the student's response was captured, never the role of the person entering it. This holds regardless of the originating material — eトレ, in-house worksheets, third-party banks, school tests.

**LLM boundary (MUST — structural, not prompt-based).** Where an LLM assists extraction, it is confined to producing `{kanji, reading, is_correct, response_text}`. The call receives a single submission with no student history, no prior entries, and no hypothesis state, so hypothesis-level interpretation is unavailable from the inputs supplied — not merely prohibited, structurally impossible. A dedicated adapter discards any additional response field before the boundary. Prompt instruction alone does not satisfy this requirement.

`manual_error_entries` schema additions:

```
manual_error_entries
  ...existing...
  entered_by_role enum(teacher, student, guardian) NOT NULL,
  submission_id uuid nullable,
  extraction_method enum(direct_entry, llm_structured),
  extraction_confidence numeric nullable
```

§15.2 extends to assert the extraction adapter's outbound payload contains no hypothesis state, no prior entries, and no student or guardian identifier.

## Part 4 — Guardian channel (v2.6 scope, sequenced after v2.5)

The guardian channel carries a new account type, a new auth surface, a new consent model, and a new item-rendering format. It is scoped as a separate workstream (v2.6), not appended to v2.5, and split into two phases (a third phase — image submission — was proposed and then dropped entirely; see Part 0.2 and Part 6).

### §11.11 Guardian accounts (new scope, reverses §20's exclusion by named decision)

Student self-login remains excluded and is not built. Guardian accounts are a distinct, deliberate addition.

Model: guardians as a distinct entity with many-to-many linkage to students — one guardian may hold multiple children at a branch, and one child may have multiple guardians. Phone number is not a 1:1 key; siblings share a household phone, separated households need multiple guardians per student, and numbers change.

```
guardians
  id uuid pk, org_id fk, phone_e164 text, display_name text,
  status enum(invited, active, revoked),
  consent_version text, consent_granted_at timestamptz,
  created_at timestamptz

guardian_students
  guardian_id fk, student_id fk, branch_id fk, org_id fk,
  linked_by_user_id fk, linked_at timestamptz,
  primary key (guardian_id, student_id)
```

Binding is created by the juku at registration, never self-asserted, and recorded with the linking user.

Capabilities: trigger home practice (§11.12), submit evidence via text (§11.13), submit free-text or voice feedback (§11.14), view the child's reports. Guardians cannot see hypothesis state directly, resolve recommendations, or view any other student.

PII: guardian records fall under §16.3 retention, export, and deletion in full. `phone_e164` is never transmitted to any LLM provider under any circumstance (§15.2).

**One positive consequence:** the guardian channel resolves the minor-consent problem that student self-upload would have left unresolved. Consent for a minor's data is given by the guardian, who is the account holder — a clean consent path that a student-login model would not have had.

### §11.11.1 Guardian-facing branding (new, MUST)

Every guardian-facing surface — invitation, authentication, portal chrome, home practice sheets, report view, error and maintenance pages, and all outbound messages — carries branch branding only. No SENJI identity is visible to a guardian at any point, including in the URL and in message sender identity. This extends §1.2's positioning from the report to the entire guardian channel, by founder decision (juku-gated invitation model, chosen over a SENJI-branded or hybrid portal to preserve the juku's ownership of the parent relationship).

Infrastructure consequences, front-loaded into 2.6a: per-organisation subdomain or neutral apex domain (a SENJI-branded URL defeats white-labelling regardless of on-page theming); juku-attributed SMS/email sender identity (Japan SMS sender ID registration has lead time); password reset, session expiry, and error/maintenance pages explicitly in scope, since these are the surfaces most likely to leak vendor identity by default.

### §11.12 Home practice (new)

Format is selected-response (per Part 0.4). Items render their distractors as tappable options; grading is deterministic, requiring no human and no image.

- Home worksheets are generated by the existing §7.x pipeline, with the triggering permission extended to guardians.
- Diagnostic coverage is narrower than classroom practice: H9 evidence and reliable H3/H4/H6/H8 evidence require production items and are not obtainable from home practice.
- Results write to `results` with `source: home_unsupervised`.
- Generated items populate that student's `exclude_item_ids` so classroom sheets do not repeat them.
- Per-student generation cap per period, configurable, separate from the instructor path (fair use, §11.1, is keyed to `corporate_number` and does not natively account for unlimited guardian-triggered generation).
- The report's "practice records captured" figure distinguishes supervised from home practice.

2.6b (home practice) does not need to wait on 2.6a's full rollout where sequencing allows — it carries no compliance surface, reduces instructor workload, and generates real evidence. It is the highest value-per-unit-of-risk item in the guardian channel.

### §11.13 Guardian evidence submission (new — text only; image path dropped)

Guardians submit evidence from non-SENJI material as **typed text only**. Image upload was considered and dropped entirely (Part 0.2) — not deferred to a later phase.

### §11.14 Free-text and voice feedback (new)

Guardian and child free-text or voice-transcribed feedback is **contextual annotation, never evidence**. It does not enter §7A.3 accumulation, does not contribute to any `state_recommendation.basis`, and cannot alone justify or move a recommendation — same category as the rejected self-confidence-score signal (unweighted subjective input has no `discrimination_factor`).

**Attribution is selected or unattributed, never inferred by a model.** The guardian selects from the child's currently rendered hypothesis cars at submission time; failing that, feedback is unattributed and displayed in a general feedback pane. Deterministic kanji-string matching (used for typed text) is explicitly disabled for voice-derived transcripts, because Japanese ASR resolves homophones arbitrarily and a mismatch would misfile feedback against the wrong hypothesis at a meaningful rate — precisely the distinction H4 exists to diagnose.

Surfaced to the instructor beside the evidentiary basis, visually distinct from it.

### §11.14.1 Voice input (new, MUST)

Voice is transcribed on the client device. The audio never leaves the device, is never uploaded, and is never persisted. Only the resulting transcript is transmitted to SENJI.

**Rationale, binding on implementation.** A voice recording is an identifier in itself, independent of its content — voiceprints fall in the biometric category under 個人情報保護法, and unlike text or images there is no redaction that removes identity from speech. Server-side transcription would make an ASR vendor a 委託先 handling a minor's biometric data, reintroducing a compliance surface comparable to the one removed with image submission.

Where client-side transcription is unavailable on a guardian's device, the field degrades to typed input. It does not fall back to server-side transcription.

Voice feeds §11.14 free-text feedback only — it is not an input path for structured evidence (`manual_error_entries`). Deriving `{kanji, reading, is_correct}` from an utterance would be interpretation of unstructured input performed on materially lower-quality data than typed/selected entry, which §11.4.1 confines to a dedicated adapter regardless of input modality.

### §15.2 extension (voice-specific)

Additionally asserts: no audio blob is written to storage or transmitted to any endpoint (asserted by fixture voice submissions); no guardian free-text or transcript reaches any LLM client, including from report generation, summarisation, or analytics paths; voice-attributed feedback records carry either an explicitly selected `hypothesis_id` or null, never kanji-derived attribution.

## Part 5 — §16.2 / §16.3 (final state — unamended for the image path)

Because image submission was dropped entirely rather than resolved via a boundary amendment, §16.2 requires **no amendment**:

> No student name, identifier, age, branch, or organisation is transmitted to any LLM provider in text form. No guardian `phone_e164` is transmitted under any circumstance. No audio is transmitted to any external provider.
>
> Guardian free-text and transcribed voice are never transmitted to any LLM provider. They are contextual annotation held inside SENJI and displayed to instructors (§11.14). This includes any future summarisation, clustering, or sentiment feature — pre-emptively prohibited, since such content will routinely contain the child's name and routing it through a model would breach this boundary regardless of the feature's intent.

§16.3 gains guardian-record retention/export/deletion coverage, and an audio-non-persistence clause:

> Guardian records fall under §16.3 retention, export, and deletion in full.
>
> Audio is never persisted. A voice input is transcribed on the client device and discarded. No audio blob is written to storage, transmitted to SENJI's servers, or sent to any third party. Microphone access is an OS-level permission and is disclosed in the guardian onboarding flow.

### §19.13 Customer-facing privacy copy — CLOSED

Because image submission was dropped, 生徒の個人情報は生成AIに送信しません remains accurate and requires no revision. A positive extension is available as a differentiator: parent feedback and voice notes are never sent to an AI provider — true under this design, and can be stated in customer-facing material.

## Part 6 — Roadmap (final)

### v2.5 — no new compliance surface

Five-state model (§7A.1); recommendation mechanism (§11.10, §11.10.1, §15.8); train-car rendering layer (§12.1); report interaction (§10.6); H8 with confusable-pairs table (§6.7); entry-path parity for the instructor path (§11.4.1); DoD #8 restatement. H8 sequenced at Weeks 5–6, ahead of H4.

### v2.6 — guardian channel, two phases (a third — image submission — considered and dropped)

| Phase | Content | Compliance exposure |
|---|---|---|
| 2.6a | Guardian accounts, `guardians` / `guardian_students`, juku-issued invitation, white-label infrastructure (domain, sender identity, theming), report viewing, §11.14 feedback with voice | Guardian PII only. No LLM boundary change |
| 2.6b | Home selected-response practice, deterministic grading, `home_unsupervised` evidence tier, generation cap, cohort exclusion | None |

2.6b does not wait on 2.6a's full rollout — it has no compliance surface, reduces instructor workload, and generates real evidence. Where sequencing allows, home practice can be issued through the instructor path before guardian accounts exist, then bound to guardian accounts when 2.6a lands.

**2.6c (image submission) does not exist.** Considered across multiple rounds of this review, and dropped by founder decision — not deferred, not backlogged. The reasoning (PII exposure with no reliable technical mitigation, plus the independent third-party-material correctness problem) is recorded in Part 0.2 so a future reader encounters it before reconsidering.

## Residual open items (unrelated to this review, still open)

| Item | Status |
|---|---|
| §19.10 Japanese state labels for the five-state model | Native-speaker review required |
| Guardian portal domain strategy | 2.6a decision — per-org subdomain vs. neutral apex |
| §19.11 Answer-key ruby | Unchanged, still open |
| §19.8 Diagnostic probe naturalness | Unchanged, still open |
