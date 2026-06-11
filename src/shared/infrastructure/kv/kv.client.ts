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

/*
 * ─── In-memory read-through cache (short TTL) ───
 *
 * Mitigates the high latency of the KV HTTP proxy adapter in production,
 * where each kvGet triggers a full network round-trip to the EdgeOne
 * Edge Function (often 1–3 s due to cold starts).
 *
 * Strategy:
 *   - Read-through: on cache miss, fetch from backend and populate cache.
 *   - Write-through: kvPut updates cache immediately after persisting.
 *   - Invalidate-on-delete: kvDelete evicts the key from cache.
 *   - Lazy eviction: expired entries are purged on access; a full sweep
 *     runs when the cache exceeds 500 entries to cap memory usage.
 *
 * 分层 TTL 策略（见 docs/DESIGN-daily-quiz.md §16.3）：
 *   - DEFAULT_CACHE_TTL_MS (10s): 普通读取，保守平衡
 *   - WRITE_THROUGH_TTL_MS (30s): 刚写入的数据肯定是最新的，可以更长
 *   - 调用方可通过 kvGet 的 cacheTtl 参数指定更长 TTL（如 AnswerKey 60s）
 */

/** 默认读取缓存 TTL — 适用于可能被外部修改的数据 */
const DEFAULT_CACHE_TTL_MS = 10_000;
/** 写入后缓存 TTL — 刚写入的数据不需要短 TTL */
const WRITE_THROUGH_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  value: string | null;
  expiry: number;
}

const readCache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null | undefined {
  const entry = readCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiry) {
    readCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: string | null, ttl = DEFAULT_CACHE_TTL_MS): void {
  readCache.set(key, { value, expiry: Date.now() + ttl });
  if (readCache.size > MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [k, e] of readCache) {
      if (now > e.expiry) readCache.delete(k);
    }
  }
}

function cacheInvalidate(key: string): void {
  readCache.delete(key);
}

/** Uniform interface that all KV backends implement. */
interface KVAdapter {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<string[]>;
}

/** Wrap native EdgeOne KV binding into the KVAdapter interface. */
function wrapEdgeOneKV(binding: EdgeOneKV): KVAdapter {
  return {
    get: (key) => binding.get(key),
    mget: (keys) => Promise.all(keys.map((k) => binding.get(k))),
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
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const url = `${base}/api/kv/${action}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kv-secret": KV_PROXY_SECRET,
      },
      body: JSON.stringify({ ns, ...body }),
    });
    const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    if (elapsed > 500) {
      console.warn(`[kv-proxy] SLOW ${action} ns=${ns} key=${(body as Record<string,unknown>).key ?? "batch"} ${elapsed.toFixed(0)}ms`);
    }
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
    async mget(keys: string[]) {
      const { values } = await call<{ values: (string | null)[] }>("mget", { keys });
      return values;
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

/** Cached adapter instances per namespace (avoid recreating on every KV call). */
const adapterCache = new Map<string, KVAdapter>();

/** Select the appropriate KV adapter for the current runtime environment. */
function getAdapter(ns: "config" | "data"): KVAdapter {
  const cached = adapterCache.get(ns);
  if (cached) return cached;

  let adapter: KVAdapter;

  // 1. Production — direct EdgeOne KV binding (available in Edge Functions)
  const binding =
    ns === "config"
      ? (globalThis as Record<string, unknown>).MED_CONFIG
      : (globalThis as Record<string, unknown>).MED_DATA;

  if (binding) {
    adapter = wrapEdgeOneKV(binding as EdgeOneKV);
  } else if (detectProduction()) {
    // 2. Production — no binding → proxy via Edge Function HTTP endpoint
    adapter = createProxyAdapter(ns);
  } else {
    // 3. Development — local file system (falls back to in-memory inside kv.local)
    adapter = getFileKV(ns === "config" ? "med_config" : "med_data");
  }

  adapterCache.set(ns, adapter);
  return adapter;
}

/**
 * Read a JSON value from KV. Returns null if the key does not exist.
 *
 * @param cacheTtl — Override the default cache TTL (ms). Use for hot-path
 *   reads where the data is unlikely to change from an external source
 *   (e.g. quiz answer keys during an active session).
 */
export async function kvGet<T>(
  key: string,
  ns: "config" | "data" = "data",
  cacheTtl?: number,
): Promise<T | null> {
  const cacheKey = `${ns}:${key}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    if (cached === null) return null;
    try { return JSON.parse(cached) as T; } catch { /* fall through */ }
  }

  const raw = await getAdapter(ns).get(key);
  cacheSet(cacheKey, raw, cacheTtl ?? DEFAULT_CACHE_TTL_MS);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`[KV] Failed to parse JSON for key "${key}"`);
    return null;
  }
}

/**
 * Batch-read multiple JSON values from KV in a single round-trip.
 * Uses read-through cache; only fetches uncached keys from the backend.
 */
export async function kvBatchGet<T>(
  keys: string[],
  ns: "config" | "data" = "data",
): Promise<(T | null)[]> {
  if (keys.length === 0) return [];

  const results: (T | null)[] = new Array(keys.length);
  const missingIndices: number[] = [];
  const missingKeys: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const cached = cacheGet(`${ns}:${keys[i]}`);
    if (cached !== undefined) {
      if (cached === null) { results[i] = null; continue; }
      try { results[i] = JSON.parse(cached) as T; continue; } catch { /* fall through */ }
    }
    missingIndices.push(i);
    missingKeys.push(keys[i]);
  }

  if (missingKeys.length > 0) {
    const rawValues = await getAdapter(ns).mget(missingKeys);
    for (let j = 0; j < missingKeys.length; j++) {
      const raw = rawValues[j];
      cacheSet(`${ns}:${missingKeys[j]}`, raw);
      if (raw === null) { results[missingIndices[j]] = null; continue; }
      try { results[missingIndices[j]] = JSON.parse(raw) as T; } catch { results[missingIndices[j]] = null; }
    }
  }

  return results;
}

/**
 * Write a JSON value to KV (upsert).
 * After persisting, the value is cached with a longer TTL (30s) since
 * the caller just wrote it — it's guaranteed fresh.
 */
export async function kvPut<T>(
  key: string,
  value: T,
  ns: "config" | "data" = "data",
): Promise<void> {
  const json = JSON.stringify(value);
  await getAdapter(ns).put(key, json);
  cacheSet(`${ns}:${key}`, json, WRITE_THROUGH_TTL_MS);
}

/** Delete a key from KV (no-op if key does not exist). */
export async function kvDelete(
  key: string,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getAdapter(ns).delete(key);
  cacheInvalidate(`${ns}:${key}`);
}

/** List keys matching a prefix from KV. */
export async function kvList(
  prefix: string,
  ns: "config" | "data" = "data",
): Promise<string[]> {
  return getAdapter(ns).list({ prefix });
}
