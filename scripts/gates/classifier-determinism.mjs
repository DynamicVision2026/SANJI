#!/usr/bin/env node
/**
 * §15.5 Classifier Determinism Gate — STUB.
 *
 * Full check (when the L3 classifier exists, Week 3, §18): run the regression
 * set through §7.4 twice in the same build and assert byte-identical
 * reading_analysis output including span offsets, plus stability against a
 * committed golden file.
 *
 * Regression set (delivered Week 2, §18): 今日, 明日, 大人, 一人, 一日, 二十日,
 * 今年, 人気, 河原, 眼鏡, 生, and the 手紙 / 紙 rendaku pair.
 *
 * Rationale (§15.5): non-deterministic tier assignment makes the regression set
 * meaningless and corrupts the corpus, since cached items carry a max_tier that
 * may no longer reproduce.
 */
import { stubGate } from "./_common.mjs";

stubGate(
  "Classifier Determinism Gate",
  "§15.5",
  "non-deterministic §7.4 tier assignment corrupting the corpus max_tier key",
  "regression set Week 2, classifier Week 3 (§18)",
);
