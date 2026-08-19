# H1 threshold integration check

This is a pure, recommendation-only pilot for the §7A.8 threshold. It accepts schema-neutral weighted evidence rows containing only `kanji`, `weight`, and an optional `evidenceId`. Rows are assumed to belong to one student because the function is not yet integrated.

The tested boundary is ≥3 weighted events across ≥2 distinct kanji. Per the final v2.5 amendment, clearing it emits an `undetected → active` recommendation only; it does not mutate student hypothesis state.

The pilot does not read from, write to, or prescribe use of `error_profile`. Future production evidence must come from the not-yet-built §7A.3 hypothesis-evidence accumulator. Any persisted rationale belongs in `state_recommendation.basis`, not `error_profile.provenance`. This pilot adds no database schema or persistence.

Fixtures cover: three events on one kanji (no recommendation), 2.9 events over two kanji (no recommendation), and 3.0 events over 激/識 (recommendation).
