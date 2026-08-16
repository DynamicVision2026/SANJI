-- 0006_ruby_policy.sql
-- organizations.ruby_policy (spec v2.3 §5.1, §9.6).
--
-- Org-level control over ruby rendering for `reason: recommended` spans:
--   conservative (default) — ruby applied when items.grade ≤ 3, suppressed ≥ 4
--   always                 — ruby applied regardless of grade
--   minimal                — ruby never applied
--
-- `reason: required` spans always render ruby regardless of this setting, and
-- suppressed_spans (target spans) never render ruby under any setting (§7.6,
-- §9.6). The policy is org-level and grade-banded rather than per-student so
-- render inputs stay available without recomputing student state, preserving
-- §7.6's persistence guarantee and corpus interchangeability (§9.6 rationale).
-- Settable by owners only (§3). The grade-3 boundary itself is runtime
-- configuration (§7.10), not a schema concern.

alter table organizations
  add column ruby_policy text not null default 'conservative'
    check (ruby_policy in ('conservative', 'always', 'minimal'));
