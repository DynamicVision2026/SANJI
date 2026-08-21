-- 0016_diagnostic_runs.sql
-- Instructor-mediated, single-student diagnostic authorization/audit boundary.

create table diagnostic_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  initiated_by_user_id uuid not null,
  status text not null default 'created' check (status = 'created'),
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (student_id, branch_id, org_id)
    references students(id, branch_id, org_id),
  foreign key (branch_id, org_id)
    references branches(id, org_id),
  foreign key (initiated_by_user_id, org_id)
    references users(id, org_id)
);

create index diagnostic_runs_student_created_idx
  on diagnostic_runs(student_id, created_at desc);

create or replace function reject_diagnostic_run_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'diagnostic run authorization boundaries are immutable'
    using errcode = '42501';
end $$;

create trigger diagnostic_runs_immutable
  before update or delete on diagnostic_runs
  for each row execute function reject_diagnostic_run_mutation();

create table diagnostic_run_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null,
  actor_user_id uuid not null,
  action text not null check (action = 'created'),
  at timestamptz not null default now(),
  unique (run_id, action),
  foreign key (run_id, org_id) references diagnostic_runs(id, org_id),
  foreign key (actor_user_id, org_id) references users(id, org_id)
);

create or replace function reject_diagnostic_run_audit_mutation() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'INSERT' and pg_trigger_depth() >= 2 then
    return new;
  end if;
  raise exception 'diagnostic run audit is append-only and system-authored'
    using errcode = '42501';
end $$;

create trigger diagnostic_run_audit_guard
  before insert or update or delete on diagnostic_run_audit
  for each row execute function reject_diagnostic_run_audit_mutation();

create or replace function append_diagnostic_run_created_audit() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into diagnostic_run_audit(org_id, run_id, actor_user_id, action, at)
  values (new.org_id, new.id, new.initiated_by_user_id, 'created', new.created_at);
  return new;
end $$;

create trigger diagnostic_run_created_audit
  after insert on diagnostic_runs
  for each row execute function append_diagnostic_run_created_audit();

create or replace function create_diagnostic_run(
  requested_org uuid,
  requested_branch uuid,
  requested_student uuid,
  requested_actor uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  created_run_id uuid;
begin
  if current_org_id() is distinct from requested_org
     or current_app_user_id() is distinct from requested_actor then
    raise exception 'diagnostic run actor does not match authenticated tenant context'
      using errcode = '42501';
  end if;

  insert into diagnostic_runs(org_id, branch_id, student_id, initiated_by_user_id)
  select s.org_id, s.branch_id, s.id, actor.id
  from students s
  join users actor
    on actor.id = requested_actor
   and actor.org_id = s.org_id
   and actor.role = 'instructor'
   and actor.status = 'active'
  join user_branch_assignments uba
    on uba.user_id = actor.id
   and uba.branch_id = s.branch_id
   and uba.org_id = s.org_id
  join student_instructor_assignments sia
    on sia.student_id = s.id
   and sia.user_id = actor.id
   and sia.org_id = s.org_id
   and sia.active
  where s.id = requested_student
    and s.org_id = requested_org
    and s.branch_id = requested_branch
  returning id into created_run_id;

  if created_run_id is null then
    raise exception 'actor is not an active instructor assigned to this student'
      using errcode = '42501';
  end if;
  return created_run_id;
end $$;

revoke all on function create_diagnostic_run(uuid, uuid, uuid, uuid) from public;

alter table diagnostic_runs enable row level security;
alter table diagnostic_run_audit enable row level security;
alter table diagnostic_runs force row level security;
alter table diagnostic_run_audit force row level security;

create policy diagnostic_runs_org_isolation on diagnostic_runs
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy diagnostic_run_audit_org_isolation on diagnostic_run_audit
  using (org_id = current_org_id()) with check (org_id = current_org_id());
