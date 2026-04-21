/**
 * KV Storage Abstraction Layer
 *
 * Provides a unified JSON get/put/delete/list API over multiple backends.
 * The adapter is chosen per-call based on the runtime environment:
 *
 *   Priority chain:
 *   1. EdgeOne KV binding (Edge Functions) — globalThis.MED_CONFIG / MED_DATA
 *   2. HTTP proxy (Next.js API routes in production) — POST /api/kv/* edge function
 *   3. Local file storage (dev) — ~/.med-recallix/kv/{namespace}/{key}.json
 *   4. In-memory Map (Edge Runtime dev fallback) — volatile, lost on restart
 *
 * Two KV namespaces are used:
 *   "config" → MED_CONFIG binding, stores AI settings, JWT secrets
 *   "data"   → MED_DATA binding, stores user data (knowledge, chats, reviews)
 */

import { getFileKV } from "./kv.local";

/** Uniform interface that all KV backends implement. */
interface KVAdapter {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<string[]>;
}

/** Wrap native EdgeOne KV binding into the KVAdapter interface. */
function wrapEdgeOneKV(binding: EdgeOneKV): KVAdapter {
  return {
    get: (key) => binding.get(key),
    put: (key, value) => binding.put(key, value),
    delete: (key) => binding.delete(key),
    async list(options) {
      const result = await binding.list({
        prefix: options?.prefix,
        limit: options?.limit ?? 256,
      });
      return result.keys.map((k) => k.key);
    },
  };
}

/** Determine base URL for the internal KV HTTP proxy (production only). */
function getKvProxyBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

/** Shared secret to authenticate proxy requests (must match edge-functions/api/kv). */
const KV_PROXY_SECRET = "med-kv-internal-2024";

/**
 * HTTP proxy adapter — used by Next.js API routes in production where
 * globalThis KV bindings are unavailable. Delegates to the EdgeOne Edge
 * Function at /api/kv/* which has direct access to KV bindings.
 */
function createProxyAdapter(ns: "config" | "data"): KVAdapter {
  const base = getKvProxyBaseUrl();

  async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}/api/kv/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kv-secret": KV_PROXY_SECRET,
      },
      body: JSON.stringify({ ns, ...body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`KV proxy ${action} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async get(key) {
      const { value } = await call<{ value: string | null }>("get", { key });
      return value;
    },
    async put(key, value) {
      await call("put", { key, value });
    },
    async delete(key) {
      await call("delete", { key });
    },
    async list(options) {
      const { keys } = await call<{ keys: string[] }>("list", {
        prefix: options?.prefix,
        limit: options?.limit ?? 256,
      });
      return keys;
    },
  };
}

let isProduction: boolean | null = null;
function detectProduction(): boolean {
  if (isProduction !== null) return isProduction;
  isProduction = process.env.NODE_ENV === "production";
  return isProduction;
}

/** Select the appropriate KV adapter for the current runtime environment. */
function getAdapter(ns: "config" | "data"): KVAdapter {
  // 1. Production — direct EdgeOne KV binding (available in Edge Functions)
  const binding =
    ns === "config"
      ? (globalThis as Record<string, unknown>).MED_CONFIG
      : (globalThis as Record<string, unknown>).MED_DATA;

  if (binding) {
    return wrapEdgeOneKV(binding as EdgeOneKV);
  }

  // 2. Production — no binding → proxy via Edge Function HTTP endpoint
  if (detectProduction()) {
    return createProxyAdapter(ns);
  }

  // 3. Development — local file system (falls back to in-memory inside kv.local)
  return getFileKV(ns === "config" ? "med_config" : "med_data");
}

/** Read a JSON value from KV. Returns null if the key does not exist. */
export async function kvGet<T>(
  key: string,
  ns: "config" | "data" = "data",
): Promise<T | null> {
  const raw = await getAdapter(ns).get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`[KV] Failed to parse JSON for key "${key}"`);
    return null;
  }
}

/** Write a JSON value to KV (upsert). */
export async function kvPut<T>(
  key: string,
  value: T,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getAdapter(ns).put(key, JSON.stringify(value));
}

/** Delete a key from KV (no-op if key does not exist). */
export async function kvDelete(
  key: string,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getAdapter(ns).delete(key);
}

/** List keys matching a prefix from KV. */
export async function kvList(
  prefix: string,
  ns: "config" | "data" = "data",
): Promise<string[]> {
  return getAdapter(ns).list({ prefix });
}
