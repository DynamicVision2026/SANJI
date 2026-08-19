# H7 熟字訓 pilot

The delivered table is complete for its stated 付表1 scope: 123 `jukujikun` rows. Whole-surface lookup is exercised before any character-level fallback.

Passing pairs: 今日/きょう, 大人/おとな, 明日/あす, 一日/ついたち, 二十歳/はたち, 七夕/たなばた. For each, a character-by-character distractor is attributed to H7.

Two work-order examples do not hold against the frozen source data:

- 明日/あした is not present; only 明日/あす is delivered. The pilot currently labels あした as H7, a false positive for ordinary Japanese usage. This needs a separately sourced lexical extension before production use.
- 人気/にんき has no 付表 row and is an ordinary on-reading compound, not 熟字訓. It remains `UNCLASSIFIED` by H7, correctly avoiding a false H7 attribution.
