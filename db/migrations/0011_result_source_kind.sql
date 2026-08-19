-- Issue #18: administration-context provenance for hypothesis evidence.
-- Existing rows deliberately remain unknown; no default or backfill is safe.

alter table results add column source_kind text null;
