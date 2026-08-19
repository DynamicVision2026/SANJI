# H7 熟字訓 pilot

The delivered table is complete for its stated 付表1 scope: 123 `jukujikun` rows. Whole-surface lookup is exercised before any character-level fallback.

Passing pairs: 今日/きょう, 大人/おとな, 明日/あす, 一日/ついたち, 二十歳/はたち, 七夕/たなばた. H7 is now closed-set: it is attributed only when the response equals an exact concatenation of the surface characters' readings from `kanji_reading_stage`. An arbitrary wrong response remains `UNCLASSIFIED` for the H1 branch instead of becoming H7 by default.

Multi-reading support is deliberately separate from the frozen §6.1 extraction. `reading_variants.json` is a versioned §6.7 asset with stable semantic IDs and per-entry provenance. The initial snapshot records 明日/あした under the architect ruling in Issue #23; the canonical 付表 remains unchanged and continues to source 明日/あす only. Direct inspection of both committed official PDFs confirmed that neither attributes あした to the 付表 row.

- 明日/あした is `CORRECT` through the curated variant. 明日/みょうにち is an exact 明 ミョウ + 日 ニチ composition and therefore H7 under the architect's explicit ruling; whether a particular context accepts it is a later pedagogy decision.
- 人気/にんき has no 付表 row and is an ordinary on-reading compound, not 熟字訓. It remains `UNCLASSIFIED` by H7, correctly avoiding a false H7 attribution.
