-- 0010_hypothesis_persistence.sql
-- V2.5 persistence foundation (§7A.1, §7A.8, §11.10, §11.10.1, §15.8).
--
-- H1-H9 produce evidence and recommendations only. The sole database path
-- that may change confirmed state is resolve_state_recommendation(...), which
-- requires an attributable human decision and appends immutable audit rows.

create table hypothesis_master (
  id text primary key check (id ~ '^H[1-9]$'),
  created_at timestamptz not null default now()
);

insert into hypothesis_master (id)
select 'H' || n from generate_series(1, 9) n;

create or replace function current_app_user_id() returns uuid
  language sql stable
as $$
  select nullif(current_setting('app.current_user', true), '')::uuid
$$;

alter table students
  add constraint students_id_branch_org_id_key unique (id, branch_id, org_id);

create table hypothesis_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  hypothesis_id text not null references hypothesis_master(id),
  evidence_key text not null,
  kanji text not null check (char_length(kanji) > 0),
  weight numeric not null check (weight > 0),
  source_kind text not null check (source_kind in (
    'probe_item', 'targeted_practice', 'manual_with_response',
    'incidental_item', 'home_unsupervised', 'manual_without_response'
  )),
  source_record_id uuid,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (org_id, evidence_key),
  foreign key (student_id, branch_id, org_id)
    references students(id, branch_id, org_id) on delete cascade
);

create table student_hypothesis_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  hypothesis_id text not null references hypothesis_master(id),
  status text not null default 'undetected' check (status in (
    'undetected', 'active', 'remediating',
    'resolved_provisional', 'resolved_stable'
  )),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, hypothesis_id),
  unique (id, org_id),
  foreign key (student_id, branch_id, org_id)
    references students(id, branch_id, org_id) on delete cascade
);

create table state_recommendation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  hypothesis_id text not null references hypothesis_master(id),
  from_status text not null check (from_status in (
    'undetected', 'active', 'remediating',
    'resolved_provisional', 'resolved_stable'
  )),
  to_status text not null check (to_status in (
    'undetected', 'active', 'remediating',
    'resolved_provisional', 'resolved_stable'
  )),
  basis jsonb not null check (jsonb_typeof(basis) = 'object' and basis <> '{}'::jsonb),
  recommended_at timestamptz not null default now(),
  resolution text not null default 'pending' check (resolution in ('pending', 'approved', 'rejected')),
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  rejection_note text,
  superseded_by uuid references state_recommendation(id),
  check (from_status <> to_status),
  check (
    (resolution = 'pending' and resolved_by_user_id is null and resolved_at is null and rejection_note is null)
    or
    (resolution = 'approved' and resolved_by_user_id is not null and resolved_at is not null and rejection_note is null)
    or
    (resolution = 'rejected' and resolved_by_user_id is not null and resolved_at is not null)
  ),
  foreign key (student_id, branch_id, org_id)
    references students(id, branch_id, org_id) on delete cascade,
  foreign key (resolved_by_user_id, org_id)
    references users(id, org_id)
);

create unique index state_recommendation_one_pending_idx
  on state_recommendation(student_id, hypothesis_id)
  where resolution = 'pending';
create index state_recommendation_branch_pending_idx
  on state_recommendation(branch_id, resolution)
  where resolution = 'pending';

create table hypothesis_state_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  state_id uuid not null,
  recommendation_id uuid not null references state_recommendation(id),
  student_id uuid not null,
  hypothesis_id text not null references hypothesis_master(id),
  from_status text not null,
  to_status text not null,
  approved_by_user_id uuid not null,
  transitioned_at timestamptz not null default now(),
  foreign key (state_id, org_id) references student_hypothesis_state(id, org_id),
  foreign key (student_id, hypothesis_id)
    references student_hypothesis_state(student_id, hypothesis_id),
  foreign key (approved_by_user_id, org_id) references users(id, org_id),
  check (from_status <> to_status)
);

create table state_recommendation_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recommendation_id uuid not null references state_recommendation(id),
  action text not null check (action in ('approved', 'rejected')),
  actor_user_id uuid not null,
  at timestamptz not null default now(),
  basis_snapshot jsonb not null,
  rejection_note text,
  foreign key (actor_user_id, org_id) references users(id, org_id)
);

create or replace function reject_hypothesis_state_mutation() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'confirmed hypothesis state cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.status <> 'undetected' then
    raise exception 'new hypothesis state must begin undetected' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and current_setting('app.approved_recommendation', true) is distinct from new.id::text then
    raise exception 'hypothesis state changes require recommendation approval' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger student_hypothesis_state_guard
  before insert or update or delete on student_hypothesis_state
  for each row execute function reject_hypothesis_state_mutation();

create or replace function guard_state_recommendation_mutation() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'recommendations cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from student_hypothesis_state s
      where s.student_id = new.student_id and s.hypothesis_id = new.hypothesis_id
        and s.org_id = new.org_id and s.branch_id = new.branch_id
        and s.status = new.from_status
    ) then
      raise exception 'recommendation does not match current confirmed state' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.student_id is distinct from old.student_id
     or new.hypothesis_id is distinct from old.hypothesis_id
     or new.org_id is distinct from old.org_id
     or new.branch_id is distinct from old.branch_id
     or new.from_status is distinct from old.from_status
     or new.to_status is distinct from old.to_status
     or new.basis is distinct from old.basis
     or new.recommended_at is distinct from old.recommended_at
     or new.superseded_by is distinct from old.superseded_by then
    raise exception 'recommendation proposal fields are immutable' using errcode = '42501';
  end if;
  if new.resolution is distinct from old.resolution
     and current_setting('app.resolved_recommendation', true) is distinct from new.id::text then
    raise exception 'recommendations require explicit human resolution' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger state_recommendation_guard
  before insert or update or delete on state_recommendation
  for each row execute function guard_state_recommendation_mutation();

create or replace function reject_immutable_hypothesis_record() returns trigger
  language plpgsql as $$
begin
  raise exception '% records are immutable', tg_table_name using errcode = '42501';
end $$;

create trigger hypothesis_evidence_immutable
  before update or delete on hypothesis_evidence
  for each row execute function reject_immutable_hypothesis_record();
create trigger hypothesis_state_audit_immutable
  before update or delete on hypothesis_state_audit
  for each row execute function reject_immutable_hypothesis_record();
create trigger state_recommendation_audit_immutable
  before update or delete on state_recommendation_audit
  for each row execute function reject_immutable_hypothesis_record();

create or replace function guard_hypothesis_audit_insert() returns trigger
  language plpgsql as $$
begin
  if current_setting('app.audit_recommendation', true) is distinct from new.recommendation_id::text then
    raise exception '% records may only be inserted by recommendation resolution', tg_table_name
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger hypothesis_state_audit_insert_guard
  before insert on hypothesis_state_audit
  for each row execute function guard_hypothesis_audit_insert();
create trigger state_recommendation_audit_insert_guard
  before insert on state_recommendation_audit
  for each row execute function guard_hypothesis_audit_insert();

create or replace function resolve_state_recommendation(
  recommendation uuid,
  actor uuid,
  decision text,
  note text default null
) returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  rec state_recommendation%rowtype;
  actor_role text;
  state_row student_hypothesis_state%rowtype;
begin
  if decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;

  if current_app_user_id() is distinct from actor then
    raise exception 'actor does not match authenticated application user' using errcode = '42501';
  end if;

  select * into rec from state_recommendation
    where id = recommendation and resolution = 'pending' for update;
  if not found then
    raise exception 'pending recommendation not found' using errcode = 'P0002';
  end if;

  if current_org_id() is distinct from rec.org_id then
    raise exception 'recommendation is outside the authenticated tenant' using errcode = '42501';
  end if;

  select role into actor_role from users where id = actor and org_id = rec.org_id and status = 'active';
  if not found or (
    actor_role = 'instructor' and not exists (
      select 1 from student_instructor_assignments sia
      where sia.student_id = rec.student_id and sia.user_id = actor
        and sia.org_id = rec.org_id and sia.active
    )
  ) then
    raise exception 'actor is not authorized for this student' using errcode = '42501';
  end if;

  select * into state_row from student_hypothesis_state
    where student_id = rec.student_id and hypothesis_id = rec.hypothesis_id for update;
  if not found or state_row.status <> rec.from_status then
    raise exception 'recommendation does not match current confirmed state' using errcode = '23514';
  end if;

  if decision = 'approved' then
    perform set_config('app.approved_recommendation', state_row.id::text, true);
    update student_hypothesis_state
      set status = rec.to_status, version = version + 1, updated_at = clock_timestamp()
      where id = state_row.id;
    perform set_config('app.approved_recommendation', '', true);
    perform set_config('app.audit_recommendation', rec.id::text, true);
    insert into hypothesis_state_audit (
      org_id, state_id, recommendation_id, student_id, hypothesis_id,
      from_status, to_status, approved_by_user_id
    ) values (
      rec.org_id, state_row.id, rec.id, rec.student_id, rec.hypothesis_id,
      rec.from_status, rec.to_status, actor
    );
  end if;

  perform set_config('app.resolved_recommendation', rec.id::text, true);
  update state_recommendation set
    resolution = decision,
    resolved_by_user_id = actor,
    resolved_at = clock_timestamp(),
    rejection_note = case when decision = 'rejected' then note else null end
  where id = rec.id;
  perform set_config('app.resolved_recommendation', '', true);

  perform set_config('app.audit_recommendation', rec.id::text, true);
  insert into state_recommendation_audit (
    org_id, recommendation_id, action, actor_user_id, basis_snapshot, rejection_note
  ) values (
    rec.org_id, rec.id, decision, actor, rec.basis,
    case when decision = 'rejected' then note else null end
  );
  perform set_config('app.audit_recommendation', '', true);
end $$;

-- No ordinary application role receives direct status-update authority.
revoke all on function resolve_state_recommendation(uuid, uuid, text, text) from public;

alter table hypothesis_evidence enable row level security;
alter table student_hypothesis_state enable row level security;
alter table state_recommendation enable row level security;
alter table hypothesis_state_audit enable row level security;
alter table state_recommendation_audit enable row level security;

-- FORCE closes PostgreSQL's table-owner RLS bypass. Superusers retain their
-- documented administrative bypass; application/table-owner roles do not.
alter table organizations force row level security;
alter table branches force row level security;
alter table users force row level security;
alter table user_branch_assignments force row level security;
alter table students force row level security;
alter table student_instructor_assignments force row level security;
alter table worksheets force row level security;
alter table worksheet_items force row level security;
alter table results force row level security;
alter table manual_error_entries force row level security;
alter table error_profile force row level security;
alter table diagnostics force row level security;
alter table reports force row level security;
alter table subscriptions force row level security;
alter table audit_log force row level security;
alter table hypothesis_evidence force row level security;
alter table student_hypothesis_state force row level security;
alter table state_recommendation force row level security;
alter table hypothesis_state_audit force row level security;
alter table state_recommendation_audit force row level security;

create policy hypothesis_evidence_org_isolation on hypothesis_evidence
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy student_hypothesis_state_org_isolation on student_hypothesis_state
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy state_recommendation_org_isolation on state_recommendation
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy hypothesis_state_audit_org_isolation on hypothesis_state_audit
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy state_recommendation_audit_org_isolation on state_recommendation_audit
  using (org_id = current_org_id()) with check (org_id = current_org_id());
