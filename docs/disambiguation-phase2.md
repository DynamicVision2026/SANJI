# Disambiguation engine Phase 2

Phase 2 adds deterministic, source-backed lookup tables for とる, つくる,
あく/あける, and あがる/あげる. Each family has independent provenance,
review status, regression tests, and a 100-run byte-identity check.

## Design evolution: paired readings

Phase 1 needed one scalar `reading_kana` because はかる has one reading. The
coordinator approved an array for strict intransitive/transitive pairs such as
`["あく", "あける"]`, together with an explicit reading argument on the
lookup function. Both forms share one semantic distinction, so duplicating
their rules would risk updating one form without the other.

The array is limited to readings that share the same underlying semantic rule
across verb forms. It must not combine semantically distinct readings merely
for convenience. Single-reading families remain unchanged and require no
re-review.
