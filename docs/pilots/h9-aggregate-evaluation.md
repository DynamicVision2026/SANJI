# H9 aggregate evaluation

H9 is an aggregate evaluation event, not a pairing of two individual results.
On report generation, or when explicitly requested, an upstream error-profile
accumulator supplies one closed recognition/production summary for the same
student, kanji, reading, and trailing window. This adapter never runs after
each grading event and never manufactures evidence from coincidental pairs.

The default window is the trailing 60 calendar days. Evidence requires at
least five recognition and five production observations and a recognition
accuracy minus production accuracy gap of at least 0.40. The evidence weight
is the lowest source factor among contributing observations. The floor, gap,
and window are runtime configuration (`SANJI_H9_MIN_OBSERVATIONS_PER_SIDE`,
`SANJI_H9_ACCURACY_GAP_THRESHOLD`, and
`SANJI_H9_EVALUATION_WINDOW_DAYS`). The numeric defaults are provisional and
must be calibrated during the Week 4 pilot with juku-director review.

Each closed window is durably recorded in
`hypothesis_aggregate_observation`. A qualifying observation creates at most
one `hypothesis_evidence` row with `source_type = aggregate`, a NULL
`source_record_id`, and a link to that observation. Neither operation changes
student hypothesis state or creates a recommendation.

The five-observation floor intentionally means H9 will rarely fire during a
student's first month. It should essentially never fire for primarily home
practice because §11.12 selected-response work supplies no production
evidence. This absence is expected safety behavior, not a pipeline defect.
