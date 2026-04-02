import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "med-recallix-token";

const PROTECTED_PATHS = ["/dashboard", "/review", "/knowledge", "/quiz", "/chat", "/settings"];
const AUTH_PATHS = ["/login", "/register"];

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "dev-secret-change-in-production",
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (!isProtected && !isAuthPage) return NextResponse.next();

  let isAuthenticated = false;
  let userId: string | undefined;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      isAuthenticated = true;
      userId = payload.sub;
    } catch {
      isAuthenticated = false;
    }
  }

  if (isProtected && !isAuthenticated) {
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
