/**
 * 客户端请求缓存层（数据获取统一入口）
 *
 * 功能：
 *   - 请求去重：并发请求同一 URL 只发一次网络请求
 *   - TTL 过期：默认 30s，可配置
 *   - 手动失效：写操作后调用 invalidateCache(url) 精准清除
 *   - prefetch 消费：底部导航预取的数据会自动被页面复用
 *
 * 使用规范：
 *   - 读操作一律用 cachedFetch（消费 prefetch 缓存，避免重复请求）
 *   - 写操作后调用 invalidateCache(相关URL)（不要在 mount 时 invalidate）
 *   - 永远不在 useEffect mount 阶段调用 invalidateCachePrefix
 *
 * 存储特性：
 *   - 纯内存 Map，SPA 刷新即清空，不会持久膨胀
 *   - 页面切换时如果缓存新鲜则零网络请求
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
    .then(async (res) => {
      const json = await res.json();
      // 仅缓存成功响应；错误响应（401/500等）不缓存，避免 TTL 期间持续返回错误
      if (res.ok) {
        cache.set(url, { data: json, timestamp: Date.now() });
      }
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
