# H6 okurigana pilot

Source: official Agency for Cultural Affairs consolidated PDF `送り仮名の付け方（一括ダウンロード版）`, SHA-256 `3b6b47b18122c707115261cbb7172abbb8b3b4b5f2fb746270acee3639914cde`. The consolidated PDF itself does not independently establish a Cabinet Notification number or promulgation date, so this pilot makes no such provenance claim.

Ten rules were exercised. Human review found that the former entries 明るむ, 関る, and 行る are independently valid dictionary words, not misspellings of the accepted forms. No documented, collision-free learner-error source was available within this pilot's approved provenance. They were therefore replaced by the collision-free malformed strings 明ららむ, 関わわる, and 行ななう. These replacements are synthetic repeated-kana controls; no claim is made that they are documented or representative learner errors.

The proposed pairs 行う/行なう, 表す/表わす, and 断る/断わる are not correct/incorrect pairs: page 3 explicitly admits both forms under 通則1 許容. For these three rows this pilot adopts Issue #24 option (b): both official forms remain accepted, while 行ななう, 表る, and 断のる are explicitly limited to classifier sanity checks. They are not representative curriculum error data and must not be reused as worksheet distractors or evidence examples.

Each row now carries a stable `clause_id` derived from the official rule structure (`tsusoku1.reigai.3`, `tsusoku2.honsoku.1`, or `tsusoku1.kyoyo`). The existing word-derived `id` remains the lookup key for this pilot. Future evidence and audit work should use `clause_id` as the durable rule identifier because it does not change with example wording or row order.

Unknown spellings remain `UNCLASSIFIED`; the pilot does not convert every typo into H6. The table remains `PENDING_HUMAN_REVIEW`.
