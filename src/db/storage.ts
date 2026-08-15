/**
 * Object storage placeholder — S3-compatible (logos, generated PDFs) (§17).
 *
 * Week 1 scope is a configuration placeholder. No SDK dependency yet. The font
 * file used by the rendering container (§9.2) is NOT stored here and MUST never
 * be publicly reachable (§16.4); that work is blocked on the Morisawa license
 * (§19.1) and is deferred.
 */

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function getObjectStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): Partial<ObjectStorageConfig> {
  return {
    endpoint: env.OBJECT_STORAGE_ENDPOINT || undefined,
    region: env.OBJECT_STORAGE_REGION || undefined,
    bucket: env.OBJECT_STORAGE_BUCKET || undefined,
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY || undefined,
  } as Partial<ObjectStorageConfig>;
}

export function requireObjectStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorageConfig {
  const c = getObjectStorageConfig(env);
  const missing = (
    ["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey"] as const
  ).filter((k) => !c[k]);
  if (missing.length > 0) {
    throw new Error(
      `Object storage is not configured: missing ${missing.join(", ")} (see .env.example).`,
    );
  }
  return c as ObjectStorageConfig;
}
