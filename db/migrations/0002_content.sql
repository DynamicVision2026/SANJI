-- 0002_content.sql
-- Content and results (spec §5.2) + RLS layered onto every tenant table (§16.1).
--
-- `items` is the shared, validated corpus (§7.8) and is NOT tenant-scoped — it
-- has no org_id and carries no student PII (§7.3). Every other table below is
-- tenant data and gets an org-scoped RLS policy, directly where an org_id
-- column exists and via a join otherwise. current_org_id() is defined in
-- 0001_tenancy_rls.sql.

-- ---------------------------------------------------------------------------
-- items — shared corpus (§5.2, §7.8). Global; no RLS.
-- ---------------------------------------------------------------------------
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('kakitori','yomi','jukugo','homophone','diagnostic')),
  target_kanji text,
  target_reading_id bigint,
  body_text text,                        -- sentence with blank marker
  answer_text text,
  blank_position int,
  grade smallint,
  kanken_level smallint,
  max_tier text,                         -- highest tier in any carrier span (§7.8)
  reading_analysis jsonb,                -- per-span tiers with offsets (§7.4)
  render_plan jsonb,                     -- ruby placement (§7.6)
  validation_status text check (validation_status in ('passed','failed','manual_review')),
  validation_report jsonb,
  source text check (source in ('generated','corpus','manual')),
  model_used text,
  usage_count int not null default 0,
  created_at timestamptz not null default now()
);
-- Corpus retrieval key (§7.8): max_tier is mandatory in the key.
create index if not exists items_corpus_key_idx
  on items (target_kanji, target_reading_id, item_type, grade, max_tier, validation_status);

-- ---------------------------------------------------------------------------
-- worksheets (§5.2) — tenant-scoped (org_id).
-- ---------------------------------------------------------------------------
create table if not exists worksheets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  created_by_user_id uuid references users(id),
  sheet_type text,
  item_count smallint,
  targeting_fidelity numeric,            -- §13; proportion of items on target
  relaxation_events jsonb,               -- §7.7; record of any target relaxation
  status text check (status in ('generated','graded','discarded')),
  generated_at timestamptz not null default now(),
  graded_at timestamptz
);
create index if not exists worksheets_org_id_idx on worksheets(org_id);

create table if not exists worksheet_items (
  worksheet_id uuid not null references worksheets(id) on delete cascade,
  item_id uuid not null references items(id),
  position int,
  primary key (worksheet_id, item_id)
);

-- ---------------------------------------------------------------------------
-- results (§5.2) — tenant data via student_id.
-- ---------------------------------------------------------------------------
create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references worksheets(id) on delete cascade,
  item_id uuid not null references items(id),
  student_id uuid not null references students(id) on delete cascade,
  is_correct boolean,
  wrong_answer_text text,
  graded_at timestamptz,
  graded_by_user_id uuid references users(id)
);
create index if not exists results_student_id_idx on results(student_id);

-- ---------------------------------------------------------------------------
-- manual_error_entries (§5.2, §10.3) — tenant-scoped (org_id).
-- Error data from material SANJI did not generate.
-- ---------------------------------------------------------------------------
create table if not exists manual_error_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  kanji text,
  reading_id bigint,
  error_kind text check (error_kind in ('reading','writing','jukugo','unknown')),
  source_label text,                     -- free text, e.g. 'eトレ', '学校テスト'
  observed_at date,
  entered_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists manual_error_entries_org_id_idx on manual_error_entries(org_id);

-- ---------------------------------------------------------------------------
-- error_profile (§5.2) — materialized view over results ∪ manual_error_entries.
-- Created as a table placeholder now; becomes a matview when the aggregation
-- (mastery_score, provenance) is built (Week 7, §18). Tenant data via student.
-- ---------------------------------------------------------------------------
create table if not exists error_profile (
  student_id uuid not null references students(id) on delete cascade,
  kanji text not null,
  reading_id bigint,
  attempts int not null default 0,
  correct int not null default 0,
  mastery_score numeric,
  last_seen_at timestamptz,
  provenance jsonb,                      -- counts by source, for §10.3
  primary key (student_id, kanji, reading_id)
);

-- ---------------------------------------------------------------------------
-- diagnostics (§5.2) — tenant data via student_id.
-- ---------------------------------------------------------------------------
create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  administered_at timestamptz,
  cadence text check (cadence in ('initial','recurring')),
  estimated_grade_level numeric,
  estimated_kanken_level smallint,
  report_id uuid
);

-- ---------------------------------------------------------------------------
-- reports (§5.2) — tenant data via branch_id.
-- ---------------------------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  report_type text check (report_type in ('diagnostic','monthly')),
  period text,                           -- 'YYYY-MM'
  content jsonb,
  comment_text text,
  comment_edited_by uuid references users(id),
  pdf_object_key text,
  generated_at timestamptz,
  exported_at timestamptz
);

-- ---------------------------------------------------------------------------
-- review_queue (§5.2, §7.7) — REVIEW_REQUIRED items, async. request_payload is
-- the §7.3 GenerationRequest and carries NO student PII (§16.2), so this is not
-- tenant data and has no org RLS.
-- ---------------------------------------------------------------------------
create table if not exists review_queue (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id),
  request_payload jsonb,
  reason text,
  status text check (status in ('open','resolved','discarded')),
  created_at timestamptz not null default now(),
  resolved_by uuid references users(id)
);

-- ---------------------------------------------------------------------------
-- subscriptions (§5.2) — tenant-scoped (org_id).
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  org_id uuid not null references organizations(id) on delete cascade,
  tier text check (tier in ('pilot','standard','growth','multisite')),
  student_cap int,
  price_jpy int,
  billing_cycle text check (billing_cycle in ('monthly','annual')),
  renewal_date date,
  status text,
  setup_fee_jpy int not null default 0,
  trial_ends_at timestamptz,
  discount_pct numeric,
  discount_ends_at timestamptz,
  primary key (org_id, tier)
);

-- ---------------------------------------------------------------------------
-- audit_log (§5.2, §16.3) — tenant-scoped (org_id).
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id),
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_org_id_idx on audit_log(org_id);

-- ---------------------------------------------------------------------------
-- RLS on every tenant table (§16.1). Direct org_id where present; join-based
-- otherwise. Covered by the Tenant Isolation Gate (§15.4).
-- ---------------------------------------------------------------------------
alter table worksheets           enable row level security;
alter table worksheet_items      enable row level security;
alter table results              enable row level security;
alter table manual_error_entries enable row level security;
alter table error_profile        enable row level security;
alter table diagnostics          enable row level security;
alter table reports              enable row level security;
alter table subscriptions        enable row level security;
alter table audit_log            enable row level security;

drop policy if exists worksheets_org_isolation on worksheets;
create policy worksheets_org_isolation on worksheets
  using (org_id = current_org_id());

drop policy if exists manual_error_entries_org_isolation on manual_error_entries;
create policy manual_error_entries_org_isolation on manual_error_entries
  using (org_id = current_org_id());

drop policy if exists subscriptions_org_isolation on subscriptions;
create policy subscriptions_org_isolation on subscriptions
  using (org_id = current_org_id());

drop policy if exists audit_log_org_isolation on audit_log;
create policy audit_log_org_isolation on audit_log
  using (org_id = current_org_id());

-- Join-based policies for tables whose tenant link is indirect.
drop policy if exists worksheet_items_org_isolation on worksheet_items;
create policy worksheet_items_org_isolation on worksheet_items
  using (exists (
    select 1 from worksheets w
    where w.id = worksheet_items.worksheet_id and w.org_id = current_org_id()
  ));

drop policy if exists results_org_isolation on results;
create policy results_org_isolation on results
  using (exists (
    select 1 from students s
    where s.id = results.student_id and s.org_id = current_org_id()
  ));

drop policy if exists error_profile_org_isolation on error_profile;
create policy error_profile_org_isolation on error_profile
  using (exists (
    select 1 from students s
    where s.id = error_profile.student_id and s.org_id = current_org_id()
  ));

drop policy if exists diagnostics_org_isolation on diagnostics;
create policy diagnostics_org_isolation on diagnostics
  using (exists (
    select 1 from students s
    where s.id = diagnostics.student_id and s.org_id = current_org_id()
  ));

drop policy if exists reports_org_isolation on reports;
create policy reports_org_isolation on reports
  using (exists (
    select 1 from branches b
    where b.id = reports.branch_id and b.org_id = current_org_id()
  ));
