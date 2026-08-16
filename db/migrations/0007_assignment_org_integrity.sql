-- 0007_assignment_org_integrity.sql
-- Cross-tenant assignment insertion blocked at the database layer
-- (issue #6 blocking issue 2; spec §15.4, §16.1).
--
-- 0004 added org_id + RLS to the assignment tables, but the RLS policy checks
-- the row's OWN org_id — a value the writer supplies. Nothing tied that org_id
-- to the org of the rows the assignment references, so an actor scoped to
-- org A could insert (org_id = A, user_id/branch_id/student_id -> org B rows):
-- the policy check was circular.
--
-- Fix: composite foreign keys against (id, org_id) on the referenced tables.
-- Every referenced entity's org_id must now equal the assignment row's own
-- org_id, enforced by Postgres on INSERT and UPDATE — not by application code
-- and not by RLS. The (id, org_id) unique constraints exist purely to be
-- composite-FK targets; id alone remains the primary key.
--
-- Verified by scripts/test-tenant-write-isolation.mjs (live-database
-- regression: org-A assignment referencing org-B rows must be rejected) and
-- asserted present by scripts/gates/tenant-isolation.mjs.

alter table users
  add constraint users_id_org_id_key unique (id, org_id);
alter table branches
  add constraint branches_id_org_id_key unique (id, org_id);
alter table students
  add constraint students_id_org_id_key unique (id, org_id);

alter table user_branch_assignments
  add constraint user_branch_assignments_user_org_fkey
    foreign key (user_id, org_id) references users (id, org_id) on delete cascade,
  add constraint user_branch_assignments_branch_org_fkey
    foreign key (branch_id, org_id) references branches (id, org_id) on delete cascade;

alter table student_instructor_assignments
  add constraint student_instructor_assignments_student_org_fkey
    foreign key (student_id, org_id) references students (id, org_id) on delete cascade,
  add constraint student_instructor_assignments_user_org_fkey
    foreign key (user_id, org_id) references users (id, org_id) on delete cascade;
