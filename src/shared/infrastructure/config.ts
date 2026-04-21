/**
 * Application-level Configuration — JWT Secret Management
 *
 * Provides the JWT signing key used by auth.service to issue and verify
 * tokens. The secret is resolved with this priority:
 *
 *   1. process.env.JWT_SECRET   — recommended for production
 *   2. KV "app_secrets"         — can be set at runtime via setJwtSecret()
 *   3. Hard-coded dev fallback  — ONLY for local development
 *
 * The resolved Uint8Array is cached in module scope so subsequent calls
 * within the same edge function invocation skip the async KV lookup.
 *
 * Note: middleware.ts and get-user-id.ts use a synchronous env-only path
 * because middleware cannot perform async KV reads.
 */

import { kvGet, kvPut, CONFIG_KEYS } from "@/shared/infrastructure/kv";

interface AppSecrets {
  jwtSecret: string;
}

let cachedJwtSecret: Uint8Array | null = null;

/** Resolve JWT secret (env → KV → dev fallback) and cache the result. */
export async function getJwtSecret(): Promise<Uint8Array> {
  if (cachedJwtSecret) return cachedJwtSecret;

  let raw = process.env.JWT_SECRET;

  if (!raw) {
    const secrets = await kvGet<AppSecrets>(CONFIG_KEYS.appSecrets, "config");
    raw = secrets?.jwtSecret;
  }

  raw = raw || "dev-secret-change-in-production";
  cachedJwtSecret = new TextEncoder().encode(raw);
  return cachedJwtSecret;
}

/** Persist a new JWT secret to KV and invalidate the in-memory cache. */
export async function setJwtSecret(secret: string): Promise<void> {
  const current = await kvGet<AppSecrets>(CONFIG_KEYS.appSecrets, "config");
  await kvPut(CONFIG_KEYS.appSecrets, { ...current, jwtSecret: secret }, "config");
  cachedJwtSecret = null;
}
