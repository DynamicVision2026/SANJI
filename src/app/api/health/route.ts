import { getRuntimeConfig } from "@/config/runtime";

/**
 * Liveness/readiness endpoint. Returns the resolved environment so deploy
 * pipelines can confirm which environment a running instance is bound to
 * (dev/staging/prod separation, §17). Adds no tenant data.
 */
export function GET() {
  const config = getRuntimeConfig();
  return Response.json({
    status: "ok",
    env: config.appEnv,
    service: "sanji",
  });
}
