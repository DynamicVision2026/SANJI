# SENJI

Kanji diagnostic and parent-reporting layer for 個別指導塾 (private tutoring schools) in Japan.

## What this is

SENJI generates personalized kanji worksheets from each student's error profile, and produces branded monthly diagnostic reports that juku (tutoring schools) hand to parents as evidence of individualized instruction. Progress is anchored to 漢検 (Kanji Kentei) certification.

**Core positioning:** SENJI is a diagnostic and parent-reporting layer that sits on top of whatever practice material a juku already uses (including incumbent tools like eトレ). It does not compete on question-bank size — it competes on dynamic, per-student targeting that a static library cannot produce and an instructor cannot sustain manually at scale.

## Specification

The single source of truth for this project is `docs/spec-v2.4.md` — the V1 Engineering Specification. It defines the data model, generation and validation pipeline, rendering requirements, build gates, and milestones.

Start with §0 (how to read the document) and §1 (why this exists) before diving into implementation sections.

## Status

Week 1 bootstrap (spec §18). See §18 (Milestones) and §19 (Open items) in the spec for current blockers and timeline.

## Development

Requires Node.js 20+.

```bash
npm ci               # install
cp .env.example .env.local   # then fill in (dev/staging/prod are separate; §17)
npm run dev          # Next.js dev server

npm run lint         # eslint (next lint)
npm run typecheck    # tsc --noEmit
npm test             # unit tests (node:test via tsx)
npm run build        # next build

npm run curriculum:check   # §6.5 curriculum coverage gate
```

### Project layout

| Path | What |
|---|---|
| `docs/spec-v2.4.md` | Single source of truth (§0 first). |
| `src/app/` | Next.js app-router skeleton (UI is out of scope until Weeks 5+, §18). |
| `src/config/runtime.ts` | Runtime configuration (§7.10) — thresholds are config, not constants. |
| `src/domain/spanRoles.ts` | **Frozen** span-role policy table (§7.5) + `tiers.ts` (§7.4). |
| `src/llm/provider.ts` | LLM provider abstraction + PII choke point (§8.1, §15.2). |
| `src/db/` | Supabase + object-storage config placeholders (§17). |
| `src/curriculum/` | Three-level schema (§6.2), `kanji_teach_grade` data + §6.5 checks. |
| `db/migrations/` | Postgres schema + RLS scaffolding (§5, §16.1). |
| `scripts/check-curriculum.mjs` | §6.5 coverage gate (real). |
| `scripts/gates/` | The six §15 build-gate scripts. |
| `.github/workflows/ci.yml` | CI: quality + curriculum + six gate jobs. |

### Build gates (§15)

Six CI gates guard six silent failure modes. In Week 1 three are already real
(PII Privacy §15.2, Font Integrity §15.3, Tenant Isolation §15.4) and three are
wired stubs whose real inputs arrive in later weeks (Specificity §15.1,
Classifier Determinism §15.5, Targeting Fidelity §15.6). Every gate exits
non-zero on violation, so the pipeline can fail the build today.

### Curriculum data provenance

`kanji_teach_grade` (all 1,026 chars, 2020 revision) is ingested and verified.
See `src/curriculum/data/SOURCES.md` for the two-source rule (§6.1) status —
notably the outstanding, founder-owned MEXT-PDF page/hash cross-verification.
