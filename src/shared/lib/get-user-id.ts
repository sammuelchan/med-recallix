import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "med-recallix-token";

/**
 * Extract userId from the request. Tries middleware-injected header first,
 * then falls back to verifying the JWT cookie directly (needed on EdgeOne
 * where middleware header injection may not reach the API route handler).
 */
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
