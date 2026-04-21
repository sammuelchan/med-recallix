/**
 * Next.js Middleware — authentication gate for all matched routes.
 *
 * Runs at the edge before every matched request. Three responsibilities:
 *   1. API protection: return 401 JSON for unauthenticated API requests
 *   2. Page protection: redirect unauthenticated users to /login (with return URL)
 *   3. Auth page redirect: send already-authenticated users to /dashboard
 *
 * On successful JWT verification, injects `x-user-id` header into the request
 * so downstream API route handlers can read the authenticated user ID without
 * re-verifying the token (though get-user-id.ts provides a cookie fallback).
 *
 * Uses synchronous env-only JWT secret because middleware cannot perform
 * async KV lookups for the signing key.
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "med-recallix-token";

const PROTECTED_PAGES = ["/dashboard", "/review", "/knowledge", "/quiz", "/chat", "/settings"];
const AUTH_PAGES = ["/login", "/register"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/register"];

/** Synchronous JWT secret — env-only, no KV (middleware must be sync-fast). */
function getJwtSecretSync(): Uint8Array {
  const raw = process.env.JWT_SECRET || "dev-secret-change-in-production";
  return new TextEncoder().encode(raw);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;

  const isApi = pathname.startsWith("/api/");
  const isProtectedPage = PROTECTED_PAGES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  const isPublicApi = PUBLIC_API.some((p) => pathname === p);

  if (!isApi && !isProtectedPage && !isAuthPage) return NextResponse.next();
  // 公开 API 不进行验证
  if (isPublicApi) return NextResponse.next();
  // 验证 JWT
  let isAuthenticated = false;
  let userId: string | undefined;

  if (token) {
    try {
      const secret = getJwtSecretSync();
      const { payload } = await jwtVerify(token, secret);
      isAuthenticated = true;
      userId = payload.sub;
    } catch {
      isAuthenticated = false;
    }
  }

  // 如果请求是 API 且未认证，返回 401
  if (isApi && !isAuthenticated) {
    return NextResponse.json(
      { success: false, error: "未登录" },
      { status: 401 },
    );
  }

  // 如果请求是受保护的页面且未认证，重定向到登录页面
  if (isProtectedPage && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 如果请求是认证页面且已认证，重定向到仪表盘
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // 如果用户已认证，注入 userId 到请求头
  if (userId) {
    const headers = new Headers(req.headers);
    headers.set("x-user-id", userId);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/review/:path*",
    "/knowledge/:path*",
    "/quiz/:path*",
    "/chat/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
