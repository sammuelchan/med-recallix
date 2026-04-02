import { NextRequest, NextResponse } from "next/server";
import { verifyJWT, AUTH_COOKIE_NAME } from "@/modules/auth";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "未登录" },
        { status: 401 },
      );
    }

    const payload = await verifyJWT(token);
    return NextResponse.json({
      success: true,
      data: { id: payload.sub, username: payload.username },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "登录已过期" },
      { status: 401 },
    );
  }
}
