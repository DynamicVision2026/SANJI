# H8 visual-confusion pilot

Candidate generation uses CJKVI IDS commit `86b4d16159f0079437870408f0ca186e529015db` (based on CHISE) plus Unicode Unihan 17.0.0 `kTotalStrokes`. The v1 algorithm keeps kyōiku-kanji pairs sharing at least one IDS component with stroke-count difference ≤1, sorts deterministically, and snapshots the first 200 candidates.

All generated and curated starting pairs remain `pending` with null reviewer/date. No pair is admitted before founder pruning. Of the six suggested starting examples, only 土/士 is mechanically recovered by v1; 王/玉, 未/末, 人/入, 目/日, and 大/犬 require the recorded `curated` basis because their IDS forms do not share a decomposed component under this input.

The exploratory counterfactual + five-call blind-cloze runs produced these traceable outcomes:

- 王/玉: attempts 1 (`王さま`) and 2 (`王子さま`) failed because the blind judge accepted `玉さま`/`玉子さま`; attempt 3 (`その王国は長い歴史を持っている`) passed with `玉国` rejected and cloze 王 5/5.
- 未/末: attempt 1 (`未来の夢`) failed because cloze chose 将 5/5; attempt 2 (`映画に未来人が登場した`) passed with `末来人` rejected and cloze 未 5/5.
- 土/士: `畑の土をやわらかく耕した` passed first attempt, cloze 土 5/5.
- 人/入: attempts 1 (`あの人`) and 2 (`三人`) failed because cloze chose 方 in attempt 1 and the blind judge accepted `三入` in attempt 2; attempt 3 (`警察が犯人を捕まえた`) passed, cloze 人 5/5.
- 目/日: `目を閉じて静かに音を聞いた` passed first attempt, cloze 目 5/5.
- 大/犬: `大きな犬が庭を走っている` passed first attempt, cloze 大 5/5.

Even passing behavioural results do not override the pending human-pruning requirement.
