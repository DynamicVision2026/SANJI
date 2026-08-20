-- 0013_item_hypothesis_inputs.sql
-- Intrinsic, generation-time H6/H7 item inputs (Issues #32/#35).
-- NULL means the item does not carry that hypothesis-specific input.

alter table items
  add column okurigana_rule_id text null,
  add column lexical_surface text null;
