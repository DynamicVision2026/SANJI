-- H6 pilot: lexical rules may now be sourced from the Cabinet Notification
-- 「送り仮名の付け方」. Existing rows and constraints are otherwise unchanged.
alter table lexical_reading_rule
  drop constraint lexical_reading_rule_rule_kind_check,
  add constraint lexical_reading_rule_rule_kind_check
    check (rule_kind in ('jukujikun','rendaku','proper_noun','furoku','okurigana'));
