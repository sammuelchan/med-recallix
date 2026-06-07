/**
 * Client-side Fetch Cache
 *
 * Lightweight in-memory cache for GET API requests with:
 *   - Request deduplication (concurrent requests to same URL share one fetch)
 *   - TTL-based expiration (default 30s, configurable)
 *   - Manual invalidation via `invalidate(url)` or `invalidateAll()`
 *
 * Designed for client components that re-mount frequently (e.g. page navigations).
 * Not a full SWR replacement, but eliminates redundant network requests.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 30_000;

/**
 * Fetch with caching. Deduplicates concurrent requests and caches results.
 * Only suitable for GET requests (idempotent, read-only).
 */
export async function cachedFetch<T>(
  url: string,
  options?: { ttl?: number; force?: boolean },
): Promise<T> {
  const ttl = options?.ttl ?? DEFAULT_TTL_MS;

  if (!options?.force) {
    const entry = cache.get(url);
    if (entry && Date.now() - entry.timestamp < ttl) {
      return entry.data as T;
    }
  }

  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const promise = fetch(url)
    .then((res) => res.json())
    .then((json) => {
      cache.set(url, { data: json, timestamp: Date.now() });
      inflight.delete(url);
      return json as T;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, promise);
  return promise as Promise<T>;
}

/** Invalidate a specific cached URL. */
export function invalidateCache(url: string): void {
  cache.delete(url);
}

/** Invalidate all entries matching a prefix. */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Clear entire cache. */
export function invalidateAll(): void {
  cache.clear();
}

/**
 * Prefetch a URL into the cache (fire-and-forget).
 * Does nothing if the URL is already cached and fresh.
 */
export function prefetch(url: string, ttl?: number): void {
  const entry = cache.get(url);
  if (entry && Date.now() - entry.timestamp < (ttl ?? DEFAULT_TTL_MS)) return;
  cachedFetch(url, { ttl }).catch(() => {});
}
