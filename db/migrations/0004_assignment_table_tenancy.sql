-- 0004_assignment_table_tenancy.sql
-- Tenant isolation for the two assignment tables (spec v2.3 §5.1, §15.4, §16.1).
--
-- v2.3 makes explicit that join and assignment tables are tenant tables and
-- MUST carry org_id and RLS, "without exception" (§5 preamble, §16.1):
--
--   user_branch_assignments           -- RLS required (§16.1)
--     user_id fk, branch_id fk, org_id fk, primary key (user_id, branch_id)
--   student_instructor_assignments    -- RLS required (§16.1)
--     student_id fk, user_id fk, org_id fk, active bool,
--     primary key (student_id, user_id)
--
-- Both tables were created in 0001 without org_id or RLS — a silent
-- cross-tenant read path (an unscoped session could enumerate which students
-- are assigned to which instructors across every juku). This migration closes
-- it. Both tables are empty pre-development, so ADD COLUMN NOT NULL is safe
-- here; it would not be later, which is why this ships now.
--
-- Covered by the Tenant Isolation Gate (§15.4), which fails loudly on any
-- tenant table lacking org_id, RLS, or a policy.

alter table user_branch_assignments
  add column org_id uuid not null references organizations(id) on delete cascade;
create index if not exists user_branch_assignments_org_id_idx
  on user_branch_assignments(org_id);

alter table student_instructor_assignments
  add column org_id uuid not null references organizations(id) on delete cascade;
create index if not exists student_instructor_assignments_org_id_idx
  on student_instructor_assignments(org_id);

alter table user_branch_assignments      enable row level security;
alter table student_instructor_assignments enable row level security;

drop policy if exists user_branch_assignments_org_isolation on user_branch_assignments;
create policy user_branch_assignments_org_isolation on user_branch_assignments
  using (org_id = current_org_id());

drop policy if exists student_instructor_assignments_org_isolation on student_instructor_assignments;
create policy student_instructor_assignments_org_isolation on student_instructor_assignments
  using (org_id = current_org_id());
