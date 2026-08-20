-- 0014_item_target_reading_ids.sql
-- Spec v2.5 §7.3: plural reading targets are required for contrastive items.
--
-- This migration intentionally lands before the remaining §7A item-tagging
-- columns. The singular column stays in place until every existing reader has
-- migrated; existing values are copied into a one-element bigint array.

alter table items
  add column target_reading_ids bigint[] null;

update items
set target_reading_ids = array[target_reading_id]
where target_reading_id is not null;
