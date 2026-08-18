import test from "node:test";
import assert from "node:assert/strict";

import { generateCandidates, parseIds, parseStrokeCounts } from "../hypotheses/h8-candidates";
import generated from "./data/h8_candidates.generated.json";
import snapshot from "./data/h8_candidate_snapshot.json";
import firstRun from "./data/h8-behavioral-results.json";
import secondRun from "./data/h8-behavioral-retry-results.json";
import thirdRun from "./data/h8-behavioral-third-results.json";

test("IDS shared components plus stroke proximity generate deterministic pending candidates", () => {
  const allowed = new Set(["休", "体", "校"]);
  const ids = parseIds("U+4F11\t休\t⿰亻木\nU+4F53\t体\t⿰亻本\nU+6821\t校\t⿰木交\n", allowed);
  const strokes = parseStrokeCounts(
    "U+4F11\tkTotalStrokes\t6\nU+4F53\tkTotalStrokes\t7\nU+6821\tkTotalStrokes\t10\n",
    allowed,
  );
  const first = generateCandidates(ids, strokes);
  assert.deepEqual(first, generateCandidates(ids, strokes));
  assert.deepEqual(first, [
    {
      left: "休",
      right: "体",
      shared_components: ["亻"],
      stroke_difference: 1,
      decision: "pending",
      reviewer: null,
      reviewed_at: null,
    },
  ]);
});

test("each starting pair has a discriminating context, while failed attempts remain recorded", () => {
  const results = [...firstRun.results, ...secondRun.results, ...thirdRun.results];
  for (const pair of ["王/玉", "未/末", "土/士", "人/入", "目/日", "大/犬"]) {
    assert.ok(results.some((result) => result.pair === pair && result.discriminates), pair);
  }
  assert.equal(firstRun.results.filter(({ discriminates }) => !discriminates).length, 3);
  assert.equal(secondRun.results.filter(({ discriminates }) => !discriminates).length, 2);
  assert.ok(results.every(({ admission_status }) => admission_status === "PENDING_HUMAN_PRUNING"));
});

test("committed snapshot is pending human pruning and admits no unreviewed pair", () => {
  assert.equal(snapshot.status, "PENDING_HUMAN_PRUNING");
  assert.equal(generated.length, 200);
  for (const candidate of [...generated, ...snapshot.curated_starting_pairs]) {
    assert.equal(candidate.decision, "pending");
    assert.equal(candidate.reviewer, null);
    assert.equal(candidate.reviewed_at, null);
  }
});
