/**
 * API Response Utilities
 *
 * Helpers for constructing Next.js API responses with appropriate
 * cache headers for different data freshness requirements.
 */
import { NextResponse } from "next/server";

type JsonValue = Record<string, unknown> | unknown[];

/**
 * Create a JSON response with short-lived private cache.
 * Suitable for user-specific data that doesn't change within a few seconds
 * (prevents duplicate requests on rapid page navigation).
 */
export function jsonWithCache(data: JsonValue, maxAge = 5) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `private, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    },
  });
}

/**
 * Create a JSON response with no caching.
 * Suitable for data that may change on every request (e.g. due cards after review).
 */
export function jsonNoCache(data: JsonValue) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, no-cache, no-store",
    },
  });
}
