import test from "node:test";
import assert from "node:assert/strict";

import { loadTeachGrade } from "../curriculum/ingest";
import {
  FULL_KANA,
  PERMITTED_PUNCTUATION,
  PROPER_NOUN_FIXTURES,
  buildFontCanary,
} from "./fontCanary";
import { RUBY_POLICIES } from "./ruby";

test("canary text contains all 1,026 kyōiku kanji (§15.3)", () => {
  const canary = buildFontCanary();
  const rows = loadTeachGrade();
  const chars = new Set(canary.text);
  const missing = rows.filter((r) => !chars.has(r.kanji)).map((r) => r.kanji);
  assert.deepEqual(missing, []);
  assert.equal(rows.length, 1026);
});

test("canary contains kana, punctuation, digits, and the proper-noun fixtures (§15.3, §9.5)", () => {
  const canary = buildFontCanary();
  for (const c of FULL_KANA) assert.ok(canary.text.includes(c), `missing kana ${c}`);
  for (const c of PERMITTED_PUNCTUATION) assert.ok(canary.text.includes(c), `missing ${c}`);
  for (const c of "0123456789") assert.ok(canary.text.includes(c), `missing digit ${c}`);
  for (const c of PROPER_NOUN_FIXTURES) assert.ok(canary.text.includes(c), `missing 異体字 ${c}`);
});

test("kana repertoire includes the iteration marks ゝ ゞ ヽ ヾ (issue #6 item 7)", () => {
  // Round-1 FULL_KANA stopped at U+3096/U+30FA and omitted the iteration
  // marks entirely — a glyph the subset must cover or §9.3's no-fallback rule
  // silently loses it.
  const canary = buildFontCanary();
  for (const mark of ["ゝ", "ゞ", "ヽ", "ヾ"]) {
    assert.ok(FULL_KANA.includes(mark), `FULL_KANA missing iteration mark ${mark}`);
    assert.ok(canary.text.includes(mark), `canary text missing iteration mark ${mark}`);
  }
  // The long-vowel mark is carried via PERMITTED_PUNCTUATION — assert it is
  // covered somewhere so the repertoire claim stays complete.
  assert.ok(canary.text.includes("ー"), "canary text missing long-vowel mark ー");
});

test("canary includes the configured allowed_with_ruby extension set (§15.3)", () => {
  const canary = buildFontCanary(["簞", "繡"]);
  assert.ok(canary.text.includes("簞"));
  assert.ok(canary.text.includes("繡"));
});

test("canary resolves ruby under EACH ruby_policy value, both sides of the boundary (v2.3 §15.3)", () => {
  const canary = buildFontCanary([], 3);
  const seen = new Set(canary.policyRenderings.map((r) => r.policy));
  assert.deepEqual([...seen].sort(), [...RUBY_POLICIES].sort());

  // conservative must be exercised on both arms of the grade boundary.
  const conservative = canary.policyRenderings.filter((r) => r.policy === "conservative");
  const below = conservative.find((r) => r.itemGrade <= 3);
  const above = conservative.find((r) => r.itemGrade > 3);
  assert.ok(below && above, "conservative must be resolved below and above the boundary");
  assert.ok(below.renderedSpans.some((s) => s.reason === "recommended"));
  assert.ok(!above.renderedSpans.some((s) => s.reason === "recommended"));
});

test("no policy rendering ever includes a suppressed span (§7.6 invariant in the canary)", () => {
  const canary = buildFontCanary();
  for (const rendering of canary.policyRenderings) {
    for (const span of rendering.renderedSpans) {
      for (const suppressed of canary.plan.suppressed_spans) {
        assert.ok(
          !(span.start < suppressed.end && suppressed.start < span.end),
          `suppressed span leaked into ${rendering.policy}/grade ${rendering.itemGrade}`,
        );
      }
    }
  }
});
