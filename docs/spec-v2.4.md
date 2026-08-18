# Spec v2.4 — Amendment Set

Merges into: v2.3 + §7A design document
Scope: Rewritten §1 / §1.1 / new §1.2; §7A.5–§7A.8; §10 amendments; §15 amendments; build-plan impact
Note: the sections below are written self-contained per the v2.1 standard and replace their v2.3 counterparts wholesale. Sections not listed carry forward unchanged.

## Part I — Strategic framing

### §1 Product summary

A B2B SaaS system sold to private tutoring schools (juku) in Japan as a student-retention tool.

**What the product is**

SENJI is a diagnostic instrument for kanji acquisition. It detects, for one specific child, not merely which characters are failing but which kind of failure is occurring — reading selection, homophone substitution, phonological alternation, visual confusion, production-recognition asymmetry, and so on. It then prescribes practice matched to that diagnosis, and re-tests the diagnosis on held-out material to confirm the intervention worked. Where the evidence is insufficient to support a diagnosis, it says so rather than asserting one.

That three-part loop — detect the failure mode, prescribe the matched remediation, verify it took — is what makes this an instrument rather than an error tally with a friendly report attached. A system that records which kanji a student got wrong, ranks them by failure count, and generates more practice on those same kanji is a gradebook. Every static question bank in this market already does that. The differentiation claimed throughout this document rests entirely on the loop above, and nothing else in the system substitutes for it.

**Why this exists**

個別指導塾 sell individualized instruction as their core promise to parents. That promise has a structural limit: genuine personalization — diagnosing each student's specific failure modes and producing material targeted to them — requires instructor time that does not scale with enrollment. Beyond a certain student count, instructors default to generic worksheets, and the juku's core promise quietly erodes.

The instructor is not the bottleneck because they lack skill. They already know how to teach. What no instructor can do at scale, for thirty or eighty students, is hold a precise per-student model of how each child's kanji comprehension breaks down and generate matched remediation for each one, every week. That is the labor SENJI substitutes for. AI is not the feature being sold; it is the mechanism that keeps the juku's promise intact at scale.

**Competitive positioning — downstream of the above**

SENJI is a diagnostic and reporting layer that sits on top of whatever practice material a juku already uses. Incumbent question banks such as eトレ provide large static libraries covering kanji reading, writing, radicals, okurigana, and homophone distinction. SENJI does not compete on library size — it competes on diagnostic depth, which a static library structurally cannot provide because a fixed item pool has no model of the individual student.

Customer-facing claim: "Keep using your existing materials. SENJI turns the results into a diagnosis and a parent-readable report."

That claim requires the system to build a complete diagnostic picture for a student who never touches a SENJI-generated worksheet (§11.2, §11.4).

### §1.2 Status of the parent report — stated for the record

The parent report is a product in its own right, co-equal with the diagnostic engine. It is not infrastructure for the engine, and the engine is not infrastructure for it.

The report is the only artifact the juku owner or the parent ever actually sees. Neither can inspect an error profile, a hypothesis state, or a confidence score. Diagnostic depth that does not surface legibly in the report has no commercial existence — it is a cost with no revenue attached. Conversely, a beautifully designed report over a shallow diagnosis is the gradebook failure in nicer clothing.

This has a binding consequence for §10: the report structure MUST be capable of expressing a hypothesis-level diagnosis, its evidence, its trend over time, and the prescribed remediation, in language a parent finds credible — not merely technically accurate. A report that can only list kanji is structurally incapable of carrying what the engine now knows, and would silently cap the product's value at the pre-v2.4 level regardless of how good the engine became.

Any prioritization conflict between diagnostic depth and report legibility is a false trade and should be escalated rather than resolved locally.

### §1.1 Standing design check

§1 is not background. It is the standard against which downstream decisions are evaluated:

- **Engineering.** A shortcut that reduces per-student diagnostic specificity — collapsing failure modes, weakening the held-out re-probe, letting corpus reuse or target relaxation dilute targeting — removes the reason the product exists. These paths are permitted but bounded, logged, and gated (§7.7, §7.8, §13, §15.6).
- **Architecture.** The hypothesis layer (§7A), the reading classifier (§7.4), and the evidence-weighting model (§7A.4) are what make "one student, one prescription" literally true. Redesigns are evaluated against whether the detect–prescribe–verify loop survives intact.
- **Coordination.** Pilot findings are weighted by whether they affect diagnostic depth or its legibility in the report. Pricing and packaging rank below both.

A note on where §1 previously fell short (recorded per §0.1). Through v2.3, §1 described the product as diagnosing "each student's specific gaps" and §1.1 as requiring "per-student targeting." Both statements were fully satisfiable by a per-kanji ratio. Nothing in the text distinguished character-level from failure-mode-level diagnosis, which is why a gradebook architecture passed four spec revisions without tripping any stated requirement. The framing above is the correction, not a refinement.

## Part II — §7A extensions

### §7A.5 The open hypothesis path

**Rationale**

H1–H9 are a strong taxonomy but not a closed one. Two things are true simultaneously: the categories derive from structural properties of the writing system and are unlikely to have a large missing member, and individual students exhibit idiosyncratic patterns that no nine-category scheme captures — a student confusing characters sharing a specific radical, or systematically failing readings introduced in one particular school term.

Requiring the taxonomy to be closed before launch would mean discarding every error pattern that doesn't fit. The open path exists so those patterns are captured, tested, and — where they prove general — promoted into the deterministic taxonomy. It is the taxonomy's discovery mechanism, not a permanent escape hatch.

**Trigger**

The open path activates for a student when unmatched error residue exceeds a configured threshold: ≥6 weighted error events in a 90-day window whose responses matched no distractor and produced no hypothesis, OR ≥4 events that fired ambiguously across ≥3 hypotheses.

**What the LLM receives**

PII-constrained, per §16.2. Outbound payload contains only:

```
{ grade, item_bodies[], target_kanji[], target_readings[],
  student_responses[],        // new outbound data class
  distractor_sets[],
  hypotheses_fired[],         // including nulls
  unmatched_response_count }
```

No student identifier, name, branch, or organisation.

New constraint on student_responses (MUST). Responses become outbound data for the first time. They are structurally low-risk — kana and kanji answer strings — but results.wrong_answer_text and manual_error_entries are instructor free-text and could contain anything. Therefore: an allowlist filter admits only strings matching expected answer shapes (kana, kanji, and permitted punctuation, within a length bound). Anything else is dropped, not scrubbed. §15.2's gate extends to cover this path.

**What the LLM is asked to produce**

Not a diagnosis. A falsifiable candidate:

```
CandidateHypothesis {
  label: string,                  // short, kanji-pattern only
  mechanism: string,              // what the student appears to be doing
  predicted_signature: {          // the verifiable part
     applies_to_kanji: char[],    // where this should also fire
     predicted_error_form: string // what a wrong answer should look like
  },
  discriminating_probe: {         // what item would confirm or refute
     item_type, target_kanji, target_reading, expected_wrong_answer
  }
}
```

The predicted_signature is the entire point. Asking a model "is this diagnosis correct?" invites confirmation of its own framing — the same weakness that made LLM-as-judge unsuitable for H4. Asking it to make a prediction produces something that can be tested against data it never saw. This is the direct analogue of blind cloze: measure behaviour, do not solicit judgment.

**Content constraint (MUST — hard)**

Candidate hypotheses describe kanji error patterns only. They MUST NOT make any claim about the student's cognition, ability, intelligence, attention, development, or any clinical or quasi-clinical condition.

A deterministic blocklist rejects any candidate whose label, mechanism, or downstream parent_text contains vocabulary in the clinical, developmental, or ability-attribution registers. Rejected candidates are discarded, not repaired.

This is not a stylistic preference. A parent report that reads as a learning-disability assessment is a serious harm to the child, a serious liability for the juku, and an existential one for SENJI. The system is not qualified to make such claims and MUST be structurally incapable of emitting them.

**Verification — three deterministic mechanisms**

- **V1 — Retrospective fit on held-out evidence.** The student's error history is split before the LLM call: a shown slice and a held-out slice the model never receives. A candidate is scored on how much of the held-out slice its predicted_signature explains. Scoring is deterministic pattern matching, no model involved.
- **V2 — Prospective probe.** Items matching discriminating_probe are generated and deployed. The candidate predicts a failure; the student either fails or does not. Deterministic.
- **V3 — Cross-student recurrence.** A candidate independently proposed for ≥3 distinct students across ≥2 organisations, validating under V1 and V2 each time, is flagged for human review and promotion into the deterministic taxonomy — meaning tables and rules are written and the LLM is removed from that path permanently.

**Admission and confirmation**

| Stage | Requirement |
|---|---|
| Proposed | LLM emits candidate; content constraint passes |
| Admitted | V1 held-out fit ≥ configured threshold |
| Active for prescription | V2 prospective probe confirms |
| Reportable to a parent | V1 and V2 both passed, and weighted evidence exceeds the deterministic-hypothesis threshold by a configured margin |
| Promoted | V3 recurrence; human review; enters deterministic taxonomy |

Candidate hypotheses face a strictly higher bar than H1–H9 before reaching a parent. The asymmetry is deliberate — a deterministic hypothesis rests on frozen tables, a candidate rests on a model's proposal, and the report is where a wrong diagnosis does real damage.

Candidate hypotheses never appear in the report with LLM-authored mechanism prose. The parent_text is generated under §10.2's containment assertion like every other report sentence.

### §7A.6 Remediation generation — default posture

Prescription leans on generation, not on curation. The scaffolding is the taxonomy, the frozen tables, the verification architecture, and the confirmation thresholds. Content is generated inside that scaffolding. Static banks are used only where no verification mechanism exists.

This inverts the v2.3 posture, in which generation was the default only for ordinary practice items and curation was proposed wherever discrimination mattered. That inversion was wrong for a specific, diagnosable reason: it assumed discrimination could only be verified by human judgment. §7A.7 establishes that it can be verified behaviourally.

**The Remediation Generation Pattern (RGP)** — one architecture, applied to every hypothesis:

1. Diagnosis → prescription template. Deterministic. Hypothesis maps to a required item shape (contrastive pair, minimal pair, exemplar set, type-mix shift).
2. Generation inside the scaffold. LLM produces candidates under §7.3 constraints plus the hypothesis-specific shape.
3. Deterministic verification. L2, L3, §7A tagging — always, unchanged.
4. Behavioural verification (§7A.7) — where the item's discriminative property is not deterministically checkable.
5. Empirical promotion. Items answered correctly by students showing no evidence of the target hypothesis accrue confidence over time; the corpus self-validates.
6. Confirmation-threshold decoupling. Item-level error is tolerated; the diagnosis gate absorbs it (§7A.8).
7. Held-out re-probe. Remediation effectiveness is measured on kanji not practiced, never on the practiced set.

### §7A.7 Behavioural verification mechanisms

**Blind cloze.** The item's target is blanked. A fresh model call with no knowledge of the intended answer fills it, sampled k times (default k=5). The item is admitted only on unanimous agreement with the intended answer.

This is categorically different from LLM-as-judge. Nothing is asked to evaluate; a model is used as a native-speaker simulator, and disagreement across unanchored samples is the signal that the context fails to force the answer. No model holds authority over correctness — the frozen tables still define what is correct, and blind cloze only decides whether an item is admitted to the corpus.

**Counterfactual substitution.** The competing character or reading is substituted in. A blind call rates acceptability. If the substitution is acceptable, the item does not discriminate and is rejected.

**Empirical promotion.** An item answered correctly by N students showing no independent evidence of the hypothesis it targets is validated by student data. Human review concentrates at launch and decays.

**Coverage map**

| Hypothesis | Deterministic check | Behavioural check needed | Notes |
|---|---|---|---|
| H1 Non-recognition | Character presence, stage | — | Fully deterministic |
| H2 On/kun selection | L3 in-context reading | Blind cloze on each half of the contrastive pair | Verifies the context actually forces the reading |
| H3 同音異義語 | L3 assertion D (disambiguator present) | Blind cloze + counterfactual | Closes the known gap: presence ≠ effectiveness |
| H4 同訓異字 | Set membership | Blind cloze + counterfactual | The hard case; see §7A.8 |
| H5 連濁/音便 | Phonological form comparison | Blind cloze on carrier only | Alternation itself is rule-checkable |
| H6 Okurigana | 送り仮名の付け方 rule set | — | Public authoritative rules |
| H7 熟字訓 | 付表 lookup | — | Bounded set |
| H8 Visual confusion | Pair-table membership | Counterfactual (primary) + blind cloze | Substituting the confusable character must break the sentence |
| H9 Production–recognition | Cross-item pairing | — | Selection policy, not content |
| HX Open path | V1 / V2 / V3 (§7A.5) | — | Prediction-testing, not judgment |

Five of nine remediation paths are LLM-generated with behavioural verification; three are fully deterministic; one is a scheduling policy. That distribution is a consequence of where verification is possible, not a target.

A note worth carrying forward: blind cloze materially upgrades H3, whose existing L3 assertion only confirms a disambiguating word is present, not that disambiguation works. That improvement was available before this review cycle and was not taken because the mechanism had not been identified.

### §7A.8 Confirmation-threshold decoupling

Item-level correctness and diagnosis-level correctness are separate gates, and the second is where the guarantee lives.

A non-discriminating item generates false evidence at discrimination_factor = 1.0 — the student's wrong answer matches the distractor exactly, indistinguishable in the data from a true positive. This is the real harm channel: not pedagogical, but diagnostic pollution.

The mitigation is not perfect items. It is a confirmation threshold sized against the item error rate:

| Hypothesis class | Threshold to reach active (reportable) |
|---|---|
| Deterministically verified (H1, H6, H7) | ≥3 weighted events, ≥2 distinct kanji |
| Behaviourally verified (H2, H3, H5, H8) | ≥3 weighted events, ≥2 distinct kanji |
| H4 | ≥4 weighted events across ≥2 distinct 同訓異字 sets |
| HX candidate | V1 + V2 passed, plus deterministic threshold × configured margin |

At an estimated 2–4% item error rate post-verification, noise clearing the H4 bar is improbable while a real H4 pattern clears it easily. The gate belongs at diagnosis confirmation, not at item generation — placing it at the item level was the error corrected in this review cycle.

## Part III — §10 amendments

### §10.1 Report structure (replaces v2.3 §10.1)

Per §1.2, the report must be structurally capable of carrying a hypothesis-level diagnosis. The weak-points block becomes diagnosis-led with evidence beneath it:

| Block | Content |
|---|---|
| Header | Branch logo + report_display_name, student name, period |
| 漢検 progress | Bar toward target 級; days to test date |
| This month | Kanji practiced, mastered, practice records captured |
| 今月わかったこと | 1–2 diagnoses: failure mode in plain language, evidence kanji, occurrence count, trend |
| 来月の指導方針 | The prescribed remediation, described as a teaching plan |
| Supporting detail | Per-kanji facts, as evidence beneath the diagnosis |
| Comment | One auto-generated line, instructor-editable |

Where no diagnosis clears threshold, the block renders honest language stating that more practice records are needed — never a fabricated finding.

### §10.2 Containment assertion (new)

Every generated sentence in the report — the comment line and any parent_text — MUST pass a deterministic containment check: it introduces no kanji, figure, date, or claim not present in the structured diagnoses object.

Violations fail generation, not review. This closes the one place where LLM prose sits beside a confident diagnosis with only a human rubber-stamp between it and a parent.

## Part IV — §15 amendments

### §15.1 Specificity Gate — additions:

- **A:** Jaccard < 0.5 over the union of diagnoses[].evidence_kanji between any two students in the same branch and period. (Jaccard over hypothesis labels would falsely fail, since two students may legitimately share a diagnosis from a set of nine.)
- **B:** every report either carries ≥1 diagnosis above threshold or sets insufficient_evidence: true. A below-threshold finding rendered as confident fails the build.
- **C:** §10.2 containment assertion passes on every generated sentence.

### §15.2 PII Privacy Gate — extended to the §7A.5 open path: assert the response allowlist filter is applied and that no wrong_answer_text or manual_error_entries free-text reaches the outbound payload unfiltered.

### §15.7 Clinical Language Gate (new). Assert that no candidate hypothesis label, mechanism, or parent_text passes the §7A.5 content blocklist. Fixture set includes deliberately clinical-sounding candidate proposals; all must be rejected.

## Part V — Build-plan impact analysis

### 1. Does anything already shipped need to change?

Almost nothing. Two named exceptions.

**Unaffected — no rework:**

| Shipped | Why it survives |
|---|---|
| kanji_teach_grade, 1,026 chars, 激 fix | Character→grade mapping. §7A does not touch it |
| Provenance manifest, PDF hash workflow, §6.5 CI | Orthogonal to the hypothesis layer |
| kanji_reading_stage (§19.2) | Becomes more load-bearing, not different. H2 distractor generation is exactly readings(K) filtered by stage — the table already provides this. No schema change |
| lexical_reading_rule | H5 and H7 read it as-is |
| §7.4 tier classifier, §7.5 span-role table | Siblings to §7A, not superseded. The Week 1 freeze holds |

New schema is purely additive migration: items.distractors, items.discriminates, structured wrong-answer fields on results, and the new student_hypothesis_state, hypothesis_master, candidate_hypothesis tables. No table is rewritten.

**Exception 1 — the §7.3 request contract.** target_reading_id becomes target_reading_ids[] to support contrastive items. This is a breaking interface change. It is far cheaper now than after Sprint 3 builds against the singular form. If the Week 1 freeze covered the request contract, this needs an explicit unfreeze decision this week.

**Exception 2 — §15.2's gate scope.** Student responses become outbound data for the first time (§7A.5). The gate as built asserts that student table fields don't reach the LLM; it does not cover a new payload field carrying instructor free-text. The allowlist filter and the extended assertion are net-new work on something already shipped and already reviewed.

### 2. Milestone impact

Sprint 3 extends by approximately one week. Recommended restructuring:

| Week | Change |
|---|---|
| 2 | Run the 200-item blind-cloze experiment. ~1 engineering day + 3–4 hours native-speaker labelling. This is the highest-leverage schedule change available — its result determines whether H2/H3/H4/H8 remediation is buildable as designed, and running it in Week 2 de-risks all of Sprint 3 |
| 3 | Pipeline + §7A tagging for H1, H2, H3, H6, H7 — the group requiring no data asset beyond what §6 already schedules |
| 3–4 | Blind-cloze and counterfactual verifiers; evidence weighting; student_hypothesis_state |
| 4 | Concierge pilot — UNCHANGED and improved. The program gate does not move. Diagnostic reports are materially deeper than the v2.3 version would have been |
| 5–6 | Rendering (unchanged) + H8, H5 as their data assets land |
| 7 | Grading with structured wrong-answer capture; manual entry; §15.6 |
| 8 | Report with diagnosis-led structure (§10.1), containment assertion, §15.7. Branding and batch export shift ~1 week right |
| 9+ | H4 remediation; HX open path; unchanged billing and hardening |

The Week 4 program gate must not move. Everything above is arranged around holding it.

### 3. Net-new founder-owned domain assets — current list

Revised after this review cycle. The first-pass list overstated the hand-authoring burden.

| Asset | Status | Effort vs. first pass |
|---|---|---|
| Confusable-pairs table (H8) | Still required. IDS decomposition data is public (CHISE, Unicode IDS) — shared-component detection plus stroke-count proximity generates candidates mechanically; human work is pruning | Weeks → days |
| 同訓異字 sets, grade-keyed (H4) | Still required — but this is set membership, low dozens of sets. The full context corpus is no longer needed | Substantially reduced |
| 同音異義語 sets, grade-keyed (H3) | Derivable from the reading tables by grouping on reading; curation for what is actually taught | Unchanged, low |
| 連濁・音便 exemplar list (H5) | Still required. Lyman's Law reduces but does not eliminate | Unchanged |
| 送り仮名の付け方 (H6) | Public — 内閣告示. Ingestion only | None |
| 常用漢字表 付表 (H7) | Public, already in the §6 plan | None |
| H4 golden set (~50 items) | NEW. Native-speaker-authored, used to measure the verifier, not as the product corpus | Small, one-time |
| 200-item experiment labels | NEW. 3–4 hours native-speaker time, Week 2 | Small, one-time |
| Recurring 10% spot review | NEW — and this is a standing commitment, not a one-time task. ~2–4 hours/month of 国語-competent native-speaker time, decaying as empirical promotion accumulates | Ongoing |

The honest trade: total effort is down versus the first pass — the large hand-authored H4 corpus is gone. But a recurring human-review obligation appears where none previously existed. That belongs in §19.10 alongside the native-speaker copy-review question, since it is likely the same person and should be resourced as one role rather than two.
