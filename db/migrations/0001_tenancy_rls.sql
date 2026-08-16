-- 0001_tenancy_rls.sql
-- Tenancy and identity (spec §5.1) + row-level security scaffolding (§16.1).
--
-- Tenant isolation is enforced in Postgres via RLS keyed by org_id, with
-- branch-level and assignment-level scoping above it (§16.1). This migration
-- establishes the tenant tables and turns RLS ON with a baseline org-scoped
-- policy. The Tenant Isolation Gate (§15.4) asserts cross-tenant reads fail.
--
-- NOTE: policies below assume the app sets a per-request GUC `app.current_org`
-- (e.g. via `SET LOCAL app.current_org = '<uuid>'` from the authenticated
-- session). Supabase deployments may instead map this onto auth.jwt() claims;
-- the choke point is intentionally a single helper (current_org_id()) so the
-- mapping can change in one place. Auth hardening is Week 9 (§18); the RLS
-- scaffolding exists now so no table is ever created without isolation.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Resolve the current tenant for RLS. Returns NULL when unset, which — combined
-- with the policies below — denies all rows rather than exposing them.
create or replace function current_org_id() returns uuid
  language sql stable
as $$
  select nullif(current_setting('app.current_org', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- organizations (§5.1)
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  corporate_number text,                 -- 法人番号; fair-use keyed on this (§11.1)
  address text,
  plan_tier text not null check (plan_tier in ('pilot','standard','growth','multisite')),
  student_cap int,
  billing_status text,
  default_logo_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- branches (§5.1)
-- ---------------------------------------------------------------------------
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  report_display_name text,              -- name printed on parent reports
  logo_url text,                         -- falls back to org default
  address text,
  created_at timestamptz not null default now()
);
create index if not exists branches_org_id_idx on branches(org_id);

-- ---------------------------------------------------------------------------
-- users (§5.1)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email citext not null unique,
  password_hash text,
  role text not null check (role in ('owner','manager','instructor')),
  status text not null check (status in ('active','invited','deactivated')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists users_org_id_idx on users(org_id);

create table if not exists user_branch_assignments (
  user_id uuid not null references users(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  primary key (user_id, branch_id)
);

-- ---------------------------------------------------------------------------
-- students (§5.1) — display_name may be an internal ID at the juku's
-- discretion (§16.3). Student PII is never sent to an LLM (§16.2).
-- ---------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  display_name text not null,
  grade smallint check (grade between 1 and 6),
  kanken_target_level smallint,
  kanken_target_date date,
  status text not null check (status in ('active','withdrawn')),
  enrolled_at date,
  created_at timestamptz not null default now()
);
create index if not exists students_org_id_idx on students(org_id);
create index if not exists students_branch_id_idx on students(branch_id);

create table if not exists student_instructor_assignments (
  student_id uuid not null references students(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  active boolean not null default true,
  primary key (student_id, user_id)
);

-- ---------------------------------------------------------------------------
-- RLS: enable + baseline org-scoped policy on every tenant table (§16.1).
-- Branch- and assignment-level scoping is layered above these in later
-- migrations as those access paths are built; org scoping is the floor and is
-- never absent.
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table branches      enable row level security;
alter table users         enable row level security;
alter table students      enable row level security;

-- organizations: a session may see only its own org row.
drop policy if exists org_isolation on organizations;
create policy org_isolation on organizations
  using (id = current_org_id());

drop policy if exists branch_org_isolation on branches;
create policy branch_org_isolation on branches
  using (org_id = current_org_id());

drop policy if exists users_org_isolation on users;
create policy users_org_isolation on users
  using (org_id = current_org_id());

drop policy if exists students_org_isolation on students;
create policy students_org_isolation on students
  using (org_id = current_org_id());
