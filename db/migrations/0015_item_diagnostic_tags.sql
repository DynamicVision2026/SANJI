-- 0015_item_diagnostic_tags.sql
-- Spec v2.5 §7A.2 item tagging. NULL means an older/not-yet-tagged item.
-- Hypothesis IDs remain an application domain because promoted HX candidates
-- can extend hypothesis_master without a PostgreSQL enum migration.

alter table items
  add column distractors jsonb null;

alter table items
  add column discriminates text[] null;
