/**
 * Next.js configuration.
 *
 * Environment separation (dev / staging / prod) is driven by APP_ENV (see
 * .env.example) rather than hardcoded here, so the same build artifact can be
 * promoted across environments. See docs/spec-v2.2.md §17 (Stack) and the
 * runtime configuration module at src/config/runtime.ts (§7.10).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // Fail the build on type errors and lint errors — silent failures are the
  // main risk class in this product (see CLAUDE.md / spec §9). Do NOT set
  // typescript.ignoreBuildErrors or eslint.ignoreDuringBuilds to true.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
