import { kvGet, kvPut, CONFIG_KEYS } from "@/shared/infrastructure/kv";

interface AppSecrets {
  jwtSecret: string;
}

let cachedJwtSecret: Uint8Array | null = null;

/**
 * Get JWT secret with priority: KV → env → dev fallback.
 * Result is cached in memory for the lifetime of the edge function instance.
 */
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

export async function setJwtSecret(secret: string): Promise<void> {
  const current = await kvGet<AppSecrets>(CONFIG_KEYS.appSecrets, "config");
  await kvPut(CONFIG_KEYS.appSecrets, { ...current, jwtSecret: secret }, "config");
  cachedJwtSecret = null;
}
