/**
 * User ID Extraction — dual-path auth for API routes.
 *
 * Path 1 (preferred): Read the `x-user-id` header injected by Next.js
 * middleware after JWT verification. Works in standard Next.js deployments.
 *
 * Path 2 (fallback): Verify the `med-recallix-token` cookie directly
 * using jose. Required on EdgeOne Pages where middleware-injected headers
 * may not propagate to API route handlers.
 *
 * Uses synchronous env-only JWT secret (same as middleware) to avoid
 * async KV lookups which would add latency to every API call.
 */

import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "med-recallix-token";

/** Return the authenticated user's ID, or null if not authenticated. */
export async function getUserId(req: NextRequest): Promise<string | null> {
  const fromHeader = req.headers.get("x-user-id");
  if (fromHeader) return fromHeader;

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  try {
    const raw = process.env.JWT_SECRET || "dev-secret-change-in-production";
    const secret = new TextEncoder().encode(raw);
    const { payload } = await jwtVerify(token, secret);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
