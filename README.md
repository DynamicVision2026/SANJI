# SENJI

Kanji diagnostic and parent-reporting layer for 個別指導塾 (private tutoring schools) in Japan.

## What this is

SENJI generates personalized kanji worksheets from each student's error profile, and produces branded monthly diagnostic reports that juku (tutoring schools) hand to parents as evidence of individualized instruction. Progress is anchored to 漢検 (Kanji Kentei) certification.

**Core positioning:** SENJI is a diagnostic and parent-reporting layer that sits on top of whatever practice material a juku already uses (including incumbent tools like eトレ). It does not compete on question-bank size — it competes on dynamic, per-student targeting that a static library cannot produce and an instructor cannot sustain manually at scale.

## Specification

The single source of truth for this project is `docs/spec-v2.2.md` — the V1 Engineering Specification. It defines the data model, generation and validation pipeline, rendering requirements, build gates, and milestones.

Start with §0 (how to read the document) and §1 (why this exists) before diving into implementation sections.

## Status

Pre-development. See §18 (Milestones) and §19 (Open items) in the spec for current blockers and timeline.
