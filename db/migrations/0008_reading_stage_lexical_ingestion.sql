-- 0008_reading_stage_lexical_ingestion.sql
-- §19.2 data delivery: reading-stage and lexical exception schema fixes,
-- discovered while ingesting the real MEXT 音訓割り振り表 data.
--
-- ---------------------------------------------------------------------------
-- Schema conflict found and resolved here (flagged per CLAUDE.md — spec vs.
-- implementation, not spec vs. issue, but the same "don't silently pick an
-- interpretation" rule applies):
--
-- 0003_curriculum.sql pointed kanji_reading_stage.kanji at
-- kanji_teach_grade(kanji) — the 1,026-character kyōiku (elementary) set.
-- That was a Week-1 guess made before real reading-stage data existed; the
-- comment on `readingStageStatus` in ingest.ts even predicted "Week 2
-- ingestion drops in without a migration."  That prediction was wrong.
--
-- The real 音訓の小・中・高等学校段階別割り振り表 covers all 2,136 常用
-- (jōyō) kanji, not just the 1,026 taught in elementary school — junior-high
-- and high-school readings are assigned to ~1,110 characters that are never
-- in kanji_teach_grade at all. §6.3's own worked example (宮, a Grade-3
-- kyōiku character) obscures this because 宮 happens to be kyōiku; most of
-- the junior_high/high_school rows are not. Keeping the FK at
-- kanji_teach_grade(kanji) would silently reject roughly half of the real,
-- source-verified data on ingestion.
--
-- Fix: a new `kanji_jouyou` table holds the full 2,136-character 常用 set
-- (superset of kanji_teach_grade, which stays untouched — it is the frozen,
-- checksum-guarded §6.5 asset and must not be widened). kanji_reading_stage
-- now references kanji_jouyou instead. This preserves the spec's "kanji fk"
-- requirement (§6.2) while matching what the source document actually
-- contains.
-- ---------------------------------------------------------------------------

create table if not exists kanji_jouyou (
  kanji text primary key,
  -- Auxiliary cross-reference, not in the §6.2 column list (same status as
  -- kanji_teach_grade.radical_number): true when this character is also one
  -- of the 1,026 kyōiku characters in kanji_teach_grade.
  in_kyoiku boolean not null default false
);

alter table kanji_reading_stage
  drop constraint kanji_reading_stage_kanji_fkey,
  add constraint kanji_reading_stage_kanji_fkey
    foreign key (kanji) references kanji_jouyou (kanji);

-- ---------------------------------------------------------------------------
-- Audit columns (§19.2 task item 4): the extractor recorded a per-row
-- confidence rating and free-text notes (e.g. the 叱 glyph-recovery note on
-- kanji_reading_stage, the appendix reading_type normalisation notes on
-- lexical_reading_rule). These must stay queryable per row, not be dropped or
-- silently promoted to uniform confidence.
-- ---------------------------------------------------------------------------

alter table kanji_reading_stage
  add column if not exists confidence text not null default 'high'
    check (confidence in ('high', 'medium', 'low')),
  add column if not exists extraction_notes text;

alter table lexical_reading_rule
  add column if not exists confidence text not null default 'high'
    check (confidence in ('high', 'medium', 'low')),
  add column if not exists extraction_notes text,
  -- Raw provenance metadata from the source spreadsheet's `reading_type`
  -- column for appendix rows: 'special' (熟字訓, 付表1) or 'proper_name'
  -- (都道府県名, 付表2). This is NOT the same enum as
  -- kanji_reading_stage.reading_type (on/kun) — lexical_reading_rule's
  -- existing `rule_kind` (jukujikun/proper_noun) is what application logic
  -- consumes; this column exists so the source's own categorisation isn't
  -- silently discarded on ingestion.
  add column if not exists source_reading_type text
    check (source_reading_type in ('special', 'proper_name'));

comment on table kanji_jouyou is
  'Full 2,136-character 常用漢字 set (§6.1 row 2 source). Superset of kanji_teach_grade (1,026 kyōiku characters); added in 0008 because the real 音訓割り振り表 data covers characters outside kanji_teach_grade.';

-- ---------------------------------------------------------------------------
-- Clarification, not a schema change: 0003's comment on
-- kanji_reading_stage.elementary_grade read "only when school_stage =
-- elementary". The real data (source note #2) populates it on EVERY row for
-- a kyōiku character, regardless of that particular reading's school_stage —
-- e.g. 宮 carries elementary_grade=3 on its junior_high グウ row as well as
-- its elementary みや row. That is correct and intentional: this column is
-- the CHARACTER's grade (mirrors kanji_teach_grade.teach_grade), not a
-- reading-level grade — exactly the §6.3 distinction the column exists to
-- support. It is null only for the ~1,110 characters that are jōyō but not
-- kyōiku (no elementary grade exists to record).
-- ---------------------------------------------------------------------------
comment on column kanji_reading_stage.elementary_grade is
  'Character-level MEXT grade (matches kanji_teach_grade.teach_grade) when this kanji is one of the 1,026 kyōiku characters, populated on every row for that character regardless of this reading''s own school_stage (§6.3). Null for jōyō-only (non-kyōiku) characters.';
