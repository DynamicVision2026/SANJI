/**
 * Curriculum data layer — three-level schema (spec §6.2).
 *
 * Global reference data, NOT tenant-scoped (§6). These TypeScript types mirror
 * the §6.2 table definitions and the SQL in db/migrations/0003_curriculum.sql.
 *
 * Central binding principle (§6.3): character grade is NOT a proxy for reading
 * grade. The same character can carry readings assigned to different school
 * stages (宮 is Grade 3, but its reading グウ is junior-high). Any logic that
 * infers reading appropriateness from `teach_grade` is incorrect (§6.3) — the
 * reading level lives in `kanji_reading_stage`, resolved per §6.4.
 */

/** Level 1 — character grade. §6.2 `kanji_teach_grade`. */
export interface KanjiTeachGrade {
  /** Primary key: the kanji character. */
  kanji: string;
  /** MEXT 学年別漢字配当表 grade, 1..6. */
  teach_grade: number;
  /** 漢検 level for that grade (§6.6): g1=10 … g6=5. */
  kanken_level: number;
  stroke_count: number;
  /** 康熙 214 radical (CJK-normalised character form). */
  radical: string;
  /** 康熙 radical number 1..214 (auxiliary; not in the §6.2 column list). */
  radical_number?: number;
}

export type ReadingType = "on" | "kun";
export type SchoolStage = "elementary" | "junior_high" | "high_school";

/** Level 2 — reading stage. §6.2 `kanji_reading_stage`. */
export interface KanjiReadingStage {
  id: number;
  kanji: string;
  reading_kana: string;
  reading_type: ReadingType;
  school_stage: SchoolStage;
  /** Only when school_stage = elementary. */
  elementary_grade: number | null;
  /** Source page in the official MEXT PDF (two-source rule, §6.1). */
  source_page: number;
  is_jukujikun: boolean;
}

export type LexicalRuleKind = "jukujikun" | "rendaku" | "proper_noun" | "furoku";

/** Level 3 — lexical exception. §6.2 `lexical_reading_rule` (v2.3: source_page NOT NULL — per-row provenance is mandatory, §6.1). */
export interface LexicalReadingRule {
  id: number;
  surface: string;
  reading_kana: string;
  rule_kind: LexicalRuleKind;
  min_stage: SchoolStage;
  min_elementary_grade: number | null;
  source_page: number;
}

export const GRADE_MIN = 1;
export const GRADE_MAX = 6;

/** Per-grade counts asserted by §6.5. Order is grade 1..6. */
export const EXPECTED_GRADE_COUNTS: Readonly<Record<number, number>> = {
  1: 80,
  2: 160,
  3: 200,
  4: 202,
  5: 193,
  6: 191,
};

export const EXPECTED_TOTAL = 1026;

/** 漢検 level for a teach grade (§6.6). */
export function kankenLevelForGrade(grade: number): number {
  return 11 - grade;
}
