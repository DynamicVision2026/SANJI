# Database migrations

Plain SQL migrations for Postgres (Supabase), applied in filename order. Tenancy
uses row-level security keyed by `org_id` with branch/assignment scoping above
it (spec §16.1); the Tenant Isolation Gate (§15.4) asserts cross-tenant reads
fail.

| File | Spec | Notes |
|---|---|---|
| `0001_tenancy_rls.sql` | §5.1, §16.1 | Tenant/identity tables, `current_org_id()` helper, RLS on. |
| `0002_content.sql` | §5.2, §16.1 | Content/results tables. `items` is the shared corpus (no RLS); all tenant tables get org-scoped RLS (direct or join). |
| `0003_curriculum.sql` | §6.2 | Three-level curriculum schema. Global, no RLS. `kanji_teach_grade` loaded from `src/curriculum/data/`. |

## Applying

A migration runner is not wired up in Week 1 (auth/DB hardening is Week 9,
§18). Apply via the Supabase SQL editor or `psql` in filename order against the
correct environment's project (dev/staging/prod are separate projects, §17).

RLS policies assume the app sets `app.current_org` per request (see the comment
in `0001_tenancy_rls.sql`); Supabase deployments may map this onto JWT claims.
The mapping is isolated to `current_org_id()` so it changes in one place.
