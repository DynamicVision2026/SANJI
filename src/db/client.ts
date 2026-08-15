/**
 * Database access placeholder — Postgres (Supabase), RLS for tenancy (§16.1).
 *
 * Week 1 scope is configuration scaffolding, not a live client. The Supabase
 * SDK is intentionally NOT a dependency yet; this module resolves and validates
 * the connection configuration so that (a) environment separation is explicit
 * (§17) and (b) the service-role key — which BYPASSES row-level security — is
 * clearly quarantined to trusted server code.
 *
 * Tenant isolation is enforced in the database via RLS keyed by org_id, with
 * branch- and assignment-level scoping above it (§16.1, migration
 * db/migrations/0001_tenancy_rls.sql), and covered by the Tenant Isolation Gate
 * (§15.4). Application code MUST use the anon/authenticated key so RLS applies;
 * the service-role key is only for controlled admin/batch paths.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Bypasses RLS — server-only, never exposed to the browser. */
  serviceRoleKey: string | undefined;
}

export function getSupabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return {
    url,
    anonKey,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  };
}

/**
 * Fail loud if the DB is used before it is configured. A silently-unconfigured
 * database is the kind of failure that looks fine locally and breaks in an
 * environment (§9 rationale) — so we throw rather than return a broken client.
 */
export function requireSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseConfig {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example). Refusing to proceed with an unconfigured database.",
    );
  }
  return config;
}
