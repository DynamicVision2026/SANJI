/**
 * Runtime configuration (spec §7.10).
 *
 * The spec is explicit: the values below MUST be runtime configuration, not
 * constants. This module is the single place they are resolved, with an
 * environment override for each and a documented default. Downstream code MUST
 * read these through `getRuntimeConfig()` and MUST NOT re-hardcode them.
 *
 * Values that spec §7.10 marks as "MUST be runtime configuration":
 *   retry count, length bands, occurrence bounds, judge threshold,
 *   worksheet item count, `allowed_with_ruby` set membership, review-queue
 *   depth ceiling, cohort overlap threshold, relaxation-rate ceiling.
 *
 * Environment separation (§17): APP_ENV selects dev/staging/prod. An unknown
 * value fails fast rather than silently defaulting — silent misconfiguration
 * is exactly the failure class this product guards against (CLAUDE.md, §9).
 */

export type AppEnv = "development" | "staging" | "production";

const VALID_ENVS: readonly AppEnv[] = ["development", "staging", "production"];

export function resolveAppEnv(raw: string | undefined): AppEnv {
  const value = (raw ?? "development").trim();
  if (!VALID_ENVS.includes(value as AppEnv)) {
    throw new Error(
      `Invalid APP_ENV=${JSON.stringify(value)}. Expected one of ${VALID_ENVS.join(
        ", ",
      )}. Refusing to boot with an unknown environment (spec §17).`,
    );
  }
  return value as AppEnv;
}

/**
 * Length bands for generated sentences, keyed by grade band (§7.4 supporting
 * assertions). Values are [min, max] inclusive character counts.
 */
export interface LengthBands {
  readonly g1_2: readonly [number, number];
  readonly g3_4: readonly [number, number];
  readonly g5_6: readonly [number, number];
}

export interface RuntimeConfig {
  readonly appEnv: AppEnv;

  /** §7.7 generate → verify → regenerate retry count. */
  readonly generationRetryCount: number;

  /** §7.4 sentence length bands per grade band. */
  readonly lengthBands: LengthBands;

  /** §7.4 target_kanji occurrence bounds [min, max] (default exactly 1). */
  readonly targetOccurrenceBounds: readonly [number, number];

  /** §7.9 L4 naturalness judge threshold (0..1). */
  readonly naturalnessJudgeThreshold: number;

  /** §11.3 / §19.5 default worksheet item count (currently 12, pending pilot). */
  readonly worksheetItemCount: number;

  /** §7.7 review-queue depth ceiling before an alert is raised. */
  readonly reviewQueueDepthCeiling: number;

  /** §7.8 cohort overlap threshold (0..1, default 0.20). */
  readonly cohortOverlapThreshold: number;

  /** §7.7 sustained relaxation-rate ceiling (0..1) before alerting. */
  readonly relaxationRateCeiling: number;

  /** §7.7 minimum fraction of configured items a worksheet may ship with. */
  readonly minimumItemFraction: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Config ${name}=${JSON.stringify(raw)} is not a finite number.`);
  }
  return parsed;
}

/**
 * Resolve the runtime configuration from the environment. Defaults are the
 * spec's stated defaults; every value can be overridden per environment.
 */
export function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    appEnv: resolveAppEnv(env.APP_ENV),
    generationRetryCount: num("SANJI_GENERATION_RETRY_COUNT", 3),
    lengthBands: {
      g1_2: [num("SANJI_LEN_G1_2_MIN", 12), num("SANJI_LEN_G1_2_MAX", 25)],
      g3_4: [num("SANJI_LEN_G3_4_MIN", 18), num("SANJI_LEN_G3_4_MAX", 35)],
      g5_6: [num("SANJI_LEN_G5_6_MIN", 25), num("SANJI_LEN_G5_6_MAX", 50)],
    },
    targetOccurrenceBounds: [
      num("SANJI_TARGET_OCCURRENCE_MIN", 1),
      num("SANJI_TARGET_OCCURRENCE_MAX", 1),
    ],
    naturalnessJudgeThreshold: num("SANJI_NATURALNESS_THRESHOLD", 0.5),
    worksheetItemCount: num("SANJI_WORKSHEET_ITEM_COUNT", 12),
    reviewQueueDepthCeiling: num("SANJI_REVIEW_QUEUE_CEILING", 200),
    cohortOverlapThreshold: num("SANJI_COHORT_OVERLAP_THRESHOLD", 0.2),
    relaxationRateCeiling: num("SANJI_RELAXATION_RATE_CEILING", 0.15),
    minimumItemFraction: num("SANJI_MINIMUM_ITEM_FRACTION", 0.8),
  };
}
