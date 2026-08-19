-- 0012_hypothesis_aggregate_observation.sql
-- Aggregate hypothesis evaluation events (Issue #25, spec v2.5 §7A.2/§7A.3).
-- H9 is based on repeated recognition/production observations, never a pair
-- of individual result rows. This generic table may later support validated HX
-- candidates, but H9 is its only consumer in this migration.

create table hypothesis_aggregate_observation (
  id uuid primary key,
  student_id uuid not null,
  org_id uuid not null,
  hypothesis_id text not null references hypothesis_master(id),
  kanji char not null,
  reading_id int references kanji_reading_stage(id),
  window_start date not null,
  window_end date not null,
  recognition_attempts int not null,
  recognition_correct int not null,
  production_attempts int not null,
  production_correct int not null,
  gap numeric not null,
  min_source_factor numeric not null,
  unique (student_id, kanji, reading_id, window_start, hypothesis_id),
  unique (id, org_id, hypothesis_id),
  foreign key (student_id, org_id) references students(id, org_id) on delete cascade,
  check (window_end >= window_start),
  check (recognition_attempts >= 0 and recognition_correct between 0 and recognition_attempts),
  check (production_attempts >= 0 and production_correct between 0 and production_attempts),
  check (gap between -1 and 1),
  check (min_source_factor > 0 and min_source_factor <= 1)
);

-- PostgreSQL UNIQUE treats NULLs as distinct. Preserve the architected
-- identity for observations without a reading_id as well.
create unique index hypothesis_aggregate_observation_null_reading_key
  on hypothesis_aggregate_observation(student_id, kanji, window_start, hypothesis_id)
  where reading_id is null;

alter table hypothesis_evidence
  add column source_type text not null default 'result'
    check (source_type in ('result', 'aggregate')),
  add column aggregate_observation_id uuid null;

alter table hypothesis_evidence
  drop constraint hypothesis_evidence_source_kind_check,
  add constraint hypothesis_evidence_source_kind_check check (source_kind in (
    'probe_item', 'targeted_practice', 'manual_with_response',
    'incidental_item', 'home_unsupervised', 'manual_without_response',
    'aggregate'
  )),
  add constraint hypothesis_evidence_source_shape_check check (
    (source_type = 'result' and source_kind <> 'aggregate' and aggregate_observation_id is null)
    or
    (source_type = 'aggregate' and source_kind = 'aggregate'
      and source_record_id is null and aggregate_observation_id is not null)
  ),
  add constraint hypothesis_evidence_aggregate_org_fkey
    foreign key (aggregate_observation_id, org_id, hypothesis_id)
    references hypothesis_aggregate_observation(id, org_id, hypothesis_id);

create unique index hypothesis_evidence_one_per_aggregate
  on hypothesis_evidence(aggregate_observation_id)
  where aggregate_observation_id is not null;

create trigger hypothesis_aggregate_observation_immutable
  before update or delete on hypothesis_aggregate_observation
  for each row execute function reject_immutable_hypothesis_record();

alter table hypothesis_aggregate_observation enable row level security;
alter table hypothesis_aggregate_observation force row level security;
create policy hypothesis_aggregate_observation_org_isolation
  on hypothesis_aggregate_observation
  using (org_id = current_org_id())
  with check (org_id = current_org_id());
