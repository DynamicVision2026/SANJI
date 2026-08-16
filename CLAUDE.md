# Project instructions for Claude Code — SANJI

Read this file in full before starting any work in this repository. It applies to every issue you work on, not just the current one.

## What this project is

SANJI (working name; product name 千字) is a B2B SaaS product for private tutoring schools (juku) in Japan. Full context, data model, and requirements are in **`docs/spec-v2.3.md`** at the repository root. That file is long (~21 sections) — read the relevant sections for whatever issue you're working on, and re-read `§0` (How to read this document) if you're unsure which sections are binding.

## Source of truth and authority order

1. **`docs/spec-v2.3.md` is the single source of truth for product and engineering requirements.** It supersedes all prior spec versions.
2. **The GitHub Issue you are assigned is the source of truth for what to work on right now and in what scope.** It will reference specific spec sections (§ numbers) — go read those sections before implementing.
3. If an issue's instructions appear to conflict with the spec, **the spec wins.** Do not silently pick an interpretation — note the conflict explicitly in your PR description and proceed with the spec's version.
4. Requirement keywords from the spec are binding: **MUST** = blocking for this phase, **SHOULD** = build if it doesn't delay the milestone, **WON'T** = explicitly out of scope — do not build it even if it seems useful.

## Your role in this project's workflow

- **You (Claude Code) are the implementer.** You do not decide what to build next, and you do not open new GitHub Issues to split or re-scope work. If you think an issue should be split, say so in a PR comment/description and let the coordinator (human, working with a separate AI coordinator) decide.
- **Your pull requests will be reviewed by a separate AI reviewer (Codex), not by you.** Write PR descriptions assuming a careful, independent reviewer who has not seen your reasoning process — explain what you built, why, and which spec sections it satisfies. Call out any assumptions, shortcuts, or deferred work explicitly. Do not mark something as done if it's partial.
- **Do not self-approve or merge your own PRs.** Leave them open for review.
- When you finish the scope of an assigned issue, stop. Do not proactively start the next milestone's work unless explicitly asked.

## Working method

- **Use your local preview capability** (dev server + browser preview) to self-check any UI work before opening a PR. Don't rely on the reviewer to catch rendering problems you could have caught yourself by looking at it.
- **Silent failures are the main risk class in this product** (see spec §9 for why — rendering that "looks valid but is wrong" is called out repeatedly as the worst failure mode). When in doubt between failing loudly (throwing an error, blocking a build gate) and degrading gracefully, prefer failing loudly unless the spec explicitly says otherwise for that case.
- Respect configuration-vs-constant requirements: anything the spec marks as "MUST be runtime configuration, not a constant" (worksheet item count, thresholds, pricing tiers, etc.) must actually be configurable, not hardcoded with a comment saying it's configurable later.
- Six CI build gates are defined in spec §15 (Specificity, PII Privacy, Font Integrity, Tenant Isolation, Classifier Determinism, Targeting Fidelity). Every gate exists because a specific failure mode is silent and reaches a customer before it reaches the team — read the "Rationale" line for each gate before touching code that could affect it.
- Do not couple business logic to a specific LLM vendor SDK — all model calls must go through the provider-abstraction interface described in spec §8.1.
- Never route student PII (name, identifier, age, branch, org) to any LLM provider — this is a hard boundary enforced by the PII Privacy Gate (§15.2 / §16.2).

## PR checklist (include this as a checklist in every PR description)

- [ ] Which spec section(s) this PR implements (cite § numbers)
- [ ] Any conflicts found between the issue and the spec, and how you resolved them
- [ ] Any open items deferred, and which spec §19 item (if any) they map to
- [ ] Confirmation that no MUST requirement in scope was skipped or stubbed without flagging it
- [ ] For UI work: confirmation you previewed it locally before opening the PR

## What NOT to do

- Don't open new issues.
- Don't merge your own PRs.
- Don't guess on ambiguous/conflicting instructions — flag them instead.
- Don't hardcode values the spec marks as configuration.
- Don't build anything listed in spec §20 (explicitly out of scope for V1).
- Don't assume font license terms that spec §19.1 marks as unconfirmed.
