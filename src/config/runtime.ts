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
 *   (v2.3 adds ruby_policy and its grade boundary — see the ruby fields.)
 *
 * Resolution rules (issue #5, Tier 2):
 *   - Every reader resolves from the ENV OBJECT PASSED IN, never from the
 *     process-global. `getRuntimeConfig(env)` with an explicit env is fully
 *     isolated from `process.env` — required for per-environment resolution
 *     (§17) and for tests.
 *   - Invalid values THROW; nothing is silently clamped or coerced. A negative
 *     count, a non-integer where an integer is required, an inverted min/max
 *     pair, or an out-of-range fraction is a misconfiguration, and silent
 *     misconfiguration is exactly the failure class this product guards
 *     against (CLAUDE.md, §9).
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

  /**
   * §7.2 / §7.10 `allowed_with_ruby` set membership. The base set is all
   * 1,026 kyōiku kanji (src/curriculum/data); this configures the 常用
   * extension characters admitted on top of it. Resolved where the character
   * sets are consumed (base ∪ extensions); stored here as the configured
   * extension characters.
   */
  readonly allowedWithRubyExtensions: readonly string[];
}

type Env = Readonly<Record<string, string | undefined>>;

function rawValue(env: Env, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  return raw.trim();
}

/** Finite, non-negative number from `env` (all §7.10 numerics are ≥ 0). */
function readNumber(env: Env, name: string, fallback: number): number {
  const raw = rawValue(env, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Config ${name}=${JSON.stringify(raw)} is not a finite number.`);
  }
  if (parsed < 0) {
    throw new Error(`Config ${name}=${raw} is negative; §7.10 values are non-negative. Refusing to start with a silently-wrong configuration.`);
  }
  return parsed;
}

/** Integer ≥ `min` from `env`. Non-integers throw; they are not rounded. */
function readInt(env: Env, name: string, fallback: number, min: number): number {
  const value = readNumber(env, name, fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`Config ${name}=${value} must be an integer; it is not rounded silently.`);
  }
  if (value < min) {
    throw new Error(`Config ${name}=${value} is below the minimum of ${min}.`);
  }
  return value;
}

/** Fraction in [0, 1] from `env`. */
function readFraction(env: Env, name: string, fallback: number): number {
  const value = readNumber(env, name, fallback);
  if (value > 1) {
    throw new Error(`Config ${name}=${value} must be a fraction in [0, 1].`);
  }
  return value;
}

/** Integer [min, max] pair; both ≥ `floor`, and min ≤ max (inverted pairs throw). */
function readIntPair(
  env: Env,
  minName: string,
  maxName: string,
  fallbackMin: number,
  fallbackMax: number,
  floor: number,
): readonly [number, number] {
  const min = readInt(env, minName, fallbackMin, floor);
  const max = readInt(env, maxName, fallbackMax, floor);
  if (min > max) {
    throw new Error(
      `Config ${minName}=${min} exceeds ${maxName}=${max} — inverted bounds are a misconfiguration, not a request to swap them.`,
    );
  }
  return [min, max];
}

/**
 * §7.2 `allowed_with_ruby` extension characters from `env`: a plain string of
 * characters (no separators), e.g. "簞繡". Each entry must be a single code
 * point; duplicates throw rather than being silently dropped.
 */
function readCharSet(env: Env, name: string): readonly string[] {
  const raw = rawValue(env, name);
  if (raw === undefined) return [];
  const chars = Array.from(raw.replace(/\s+/g, ""));
  const seen = new Set<string>();
  for (const c of chars) {
    if (seen.has(c)) {
      throw new Error(`Config ${name} contains duplicate character entries; deduplicate the configuration instead of relying on silent dedup.`);
    }
    seen.add(c);
  }
  return chars;
}

/**
 * Resolve the runtime configuration from the supplied environment. Defaults
 * are the spec's stated defaults; every value can be overridden per
 * environment. When `env` is passed explicitly, `process.env` is not consulted
 * at all.
 */
export function getRuntimeConfig(env: Env = process.env): RuntimeConfig {
  return {
    appEnv: resolveAppEnv(env.APP_ENV),
    generationRetryCount: readInt(env, "SANJI_GENERATION_RETRY_COUNT", 3, 0),
    lengthBands: {
      g1_2: readIntPair(env, "SANJI_LEN_G1_2_MIN", "SANJI_LEN_G1_2_MAX", 12, 25, 1),
      g3_4: readIntPair(env, "SANJI_LEN_G3_4_MIN", "SANJI_LEN_G3_4_MAX", 18, 35, 1),
      g5_6: readIntPair(env, "SANJI_LEN_G5_6_MIN", "SANJI_LEN_G5_6_MAX", 25, 50, 1),
    },
    targetOccurrenceBounds: readIntPair(
      env,
      "SANJI_TARGET_OCCURRENCE_MIN",
      "SANJI_TARGET_OCCURRENCE_MAX",
      1,
      1,
      0,
    ),
    naturalnessJudgeThreshold: readFraction(env, "SANJI_NATURALNESS_THRESHOLD", 0.5),
    worksheetItemCount: readInt(env, "SANJI_WORKSHEET_ITEM_COUNT", 12, 1),
    reviewQueueDepthCeiling: readInt(env, "SANJI_REVIEW_QUEUE_CEILING", 200, 1),
    cohortOverlapThreshold: readFraction(env, "SANJI_COHORT_OVERLAP_THRESHOLD", 0.2),
    relaxationRateCeiling: readFraction(env, "SANJI_RELAXATION_RATE_CEILING", 0.15),
    minimumItemFraction: readFraction(env, "SANJI_MINIMUM_ITEM_FRACTION", 0.8),
    allowedWithRubyExtensions: readCharSet(env, "SANJI_ALLOWED_WITH_RUBY_EXTENSIONS"),
  };
}
