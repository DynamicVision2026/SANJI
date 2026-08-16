-- 0003_curriculum.sql
-- Curriculum data layer — three-level schema (spec §6.2).
--
-- Global reference data, NOT tenant-scoped (§6). No RLS. Maintained as a
-- versioned asset with migration history; the `kanji_teach_grade` rows are
-- loaded from src/curriculum/data/kanji_teach_grade.json (see SOURCES.md for
-- provenance and the §6.1 two-source status).
--
-- §6.3 (binding everywhere downstream): character grade is NOT a proxy for
-- reading grade. Reading appropriateness lives in kanji_reading_stage, resolved
-- per §6.4 (lexical rules BEFORE morphology).

-- Level 1 — character grade. Fully ingested this week (§18, §6.1 row 1).
create table if not exists kanji_teach_grade (
  kanji text primary key,
  teach_grade smallint not null check (teach_grade between 1 and 6),
  kanken_level smallint not null,        -- §6.6: g1=10 … g6=5
  stroke_count smallint,
  radical text,
  radical_number smallint                -- auxiliary; not in the §6.2 column list
);

-- Level 2 — reading stage. §6.1 row 2 is BLOCKED on founder source extraction
-- (§19.2); the schema exists now so Week 2 ingestion needs no migration. Every
-- row records its source_page (two-source rule, §6.1).
create table if not exists kanji_reading_stage (
  id bigserial primary key,
  kanji text not null references kanji_teach_grade(kanji),
  reading_kana text not null,
  reading_type text not null check (reading_type in ('on','kun')),
  school_stage text not null check (school_stage in ('elementary','junior_high','high_school')),
  elementary_grade smallint,             -- only when school_stage = elementary
  source_page int not null,
  is_jukujikun boolean not null default false
);
create index if not exists kanji_reading_stage_kanji_idx on kanji_reading_stage(kanji);

-- Level 3 — lexical exception. §6.1 row 3, also BLOCKED on §19.2. Lexical rules
-- resolve BEFORE morphological analysis (§6.4).
create table if not exists lexical_reading_rule (
  id bigserial primary key,
  surface text not null,
  reading_kana text not null,
  rule_kind text not null check (rule_kind in ('jukujikun','rendaku','proper_noun','furoku')),
  min_stage text not null check (min_stage in ('elementary','junior_high','high_school')),
  min_elementary_grade smallint,
  source_page int
);
create index if not exists lexical_reading_rule_surface_idx on lexical_reading_rule(surface);
