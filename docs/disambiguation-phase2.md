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

The same approved structure is used for `["あがる", "あげる"]`. The official
report says 花火 may use 揚 or 上 depending on viewpoint, so `花火` appears in
both rules and the multi-target conflict path returns `REVIEW_REQUIRED`.

The official とる entry permits both 魚を取る and 魚を捕る depending on
viewpoint. `魚` therefore appears in both rules; the existing multi-target
conflict path makes `disambiguateToru("魚をとる。")` return
`target_kanji: null` with `certainty: REVIEW_REQUIRED`, independent of rule
ordering.

Likewise, `花火` appears in both 上 and 揚 rules. With no other
disambiguating signal, `disambiguateAgaruAgeru("花火があがる。", "あがる")`
returns `target_kanji: null` with `certainty: REVIEW_REQUIRED`, independent of
rule ordering. The 海外 rule uses the complete official phrase
`海外から引き揚げる`; bare `海外` does not produce a confident match.
