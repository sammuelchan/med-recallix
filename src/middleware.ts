import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "med-recallix-token";

const PROTECTED_PAGES = ["/dashboard", "/review", "/knowledge", "/quiz", "/chat", "/settings"];
const AUTH_PAGES = ["/login", "/register"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/register"];

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
  if (isPublicApi) return NextResponse.next();

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

  if (isApi && !isAuthenticated) {
    return NextResponse.json(
      { success: false, error: "未登录" },
      { status: 401 },
    );
  }

  if (isProtectedPage && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

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
