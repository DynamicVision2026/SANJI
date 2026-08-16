import test from "node:test";
import assert from "node:assert/strict";

import { getRuntimeConfig, resolveAppEnv } from "./runtime";

const BASE = { APP_ENV: "development" } as const;

test("defaults resolve when nothing is set", () => {
  const config = getRuntimeConfig(BASE);
  assert.equal(config.generationRetryCount, 3);
  assert.equal(config.worksheetItemCount, 12);
  assert.deepEqual(config.lengthBands.g1_2, [12, 25]);
  assert.deepEqual(config.targetOccurrenceBounds, [1, 1]);
  assert.equal(config.cohortOverlapThreshold, 0.2);
  assert.deepEqual(config.allowedWithRubyExtensions, []);
});

test("readers honour the PASSED env, not process.env (issue #5 finding 4)", () => {
  // The original bug: num() read process.env directly, so only APP_ENV
  // respected the supplied environment object.
  process.env.SANJI_GENERATION_RETRY_COUNT = "9";
  process.env.SANJI_WORKSHEET_ITEM_COUNT = "20";
  try {
    const config = getRuntimeConfig({ APP_ENV: "staging", SANJI_WORKSHEET_ITEM_COUNT: "16" });
    assert.equal(config.appEnv, "staging");
    // From the passed env:
    assert.equal(config.worksheetItemCount, 16);
    // NOT leaked from process.env — the passed env has no retry override:
    assert.equal(config.generationRetryCount, 3);
  } finally {
    delete process.env.SANJI_GENERATION_RETRY_COUNT;
    delete process.env.SANJI_WORKSHEET_ITEM_COUNT;
  }
});

test("process.env remains the default source when no env is passed", () => {
  process.env.SANJI_WORKSHEET_ITEM_COUNT = "14";
  try {
    assert.equal(getRuntimeConfig().worksheetItemCount, 14);
  } finally {
    delete process.env.SANJI_WORKSHEET_ITEM_COUNT;
  }
});

test("unknown APP_ENV throws (fail loud, §17)", () => {
  assert.throws(() => resolveAppEnv("prod"), /Invalid APP_ENV/);
  assert.throws(() => getRuntimeConfig({ APP_ENV: "qa" }), /Invalid APP_ENV/);
});

test("negative counts throw instead of passing through", () => {
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_GENERATION_RETRY_COUNT: "-1" }),
    /negative/,
  );
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_REVIEW_QUEUE_CEILING: "-5" }),
    /negative/,
  );
});

test("non-integers where integers are required throw (no silent rounding)", () => {
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_WORKSHEET_ITEM_COUNT: "12.5" }),
    /must be an integer/,
  );
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_LEN_G3_4_MIN: "18.2" }),
    /must be an integer/,
  );
});

test("inverted min/max bounds throw (no silent swap or clamp)", () => {
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_LEN_G1_2_MIN: "30", SANJI_LEN_G1_2_MAX: "20" }),
    /inverted bounds/,
  );
  assert.throws(
    () =>
      getRuntimeConfig({
        ...BASE,
        SANJI_TARGET_OCCURRENCE_MIN: "2",
        SANJI_TARGET_OCCURRENCE_MAX: "1",
      }),
    /inverted bounds/,
  );
});

test("fractions outside [0,1] throw", () => {
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_COHORT_OVERLAP_THRESHOLD: "1.5" }),
    /fraction in \[0, 1\]/,
  );
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_MINIMUM_ITEM_FRACTION: "-0.1" }),
    /negative/,
  );
});

test("non-numeric garbage throws", () => {
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_NATURALNESS_THRESHOLD: "high" }),
    /not a finite number/,
  );
});

test("zero-count worksheet throws (minimum 1)", () => {
  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_WORKSHEET_ITEM_COUNT: "0" }),
    /below the minimum/,
  );
});

test("allowed_with_ruby extensions parse as characters; duplicates throw (§7.10)", () => {
  const config = getRuntimeConfig({
    ...BASE,
    SANJI_ALLOWED_WITH_RUBY_EXTENSIONS: "簞繡鬱",
  });
  assert.deepEqual(config.allowedWithRubyExtensions, ["簞", "繡", "鬱"]);

  assert.throws(
    () => getRuntimeConfig({ ...BASE, SANJI_ALLOWED_WITH_RUBY_EXTENSIONS: "簞簞" }),
    /duplicate character/,
  );
});
