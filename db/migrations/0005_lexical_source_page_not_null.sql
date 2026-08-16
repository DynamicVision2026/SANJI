-- 0005_lexical_source_page_not_null.sql
-- lexical_reading_rule.source_page → NOT NULL (spec v2.3 §6.2).
--
-- v2.3 tightens the lexical-exception schema: provenance for the reading and
-- lexical tables is per-row (§6.1 provenance granularity), so `source_page`
-- is mandatory on both kanji_reading_stage (already NOT NULL in 0003) and
-- lexical_reading_rule (nullable in 0003 per the v2.2 schema; fixed here).
--
-- The table is empty — §19.2 source data has not landed — so this constraint
-- change is zero-risk now and would not be after ingestion. Rows without a
-- printed source page number must not be ingested at all (§6.1: leave rows
-- unwritten rather than guessing).

alter table lexical_reading_rule
  alter column source_page set not null;
