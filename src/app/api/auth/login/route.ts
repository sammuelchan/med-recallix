import { NextRequest, NextResponse } from "next/server";
import { login, LoginSchema, buildCookieHeader } from "@/modules/auth";
import { AppError } from "@/shared/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = LoginSchema.parse(body);

    const { user, token } = await login(username, password);

    return NextResponse.json(
      { success: true, data: user },
      {
        status: 200,
        headers: { "Set-Cookie": buildCookieHeader(token) },
      },
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.status });
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { success: false, error: "输入格式有误" },
        { status: 400 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[login] Unhandled error:", msg);
    return NextResponse.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 },
    );
  }
}
