import { NextRequest, NextResponse } from "next/server";
import { register, LoginSchema, buildCookieHeader } from "@/modules/auth";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  const g = globalThis as Record<string, unknown>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = typeof self !== "undefined" ? (self as any) : undefined;
  const globalKeys = Object.keys(g).filter(k =>
    k.toUpperCase().includes("MED") || k.toUpperCase().includes("KV")
  );
  return NextResponse.json({
    hasMedData: !!g.MED_DATA,
    hasMedConfig: !!g.MED_CONFIG,
    medDataType: typeof g.MED_DATA,
    medConfigType: typeof g.MED_CONFIG,
    selfMedData: typeof w?.MED_DATA,
    selfMedConfig: typeof w?.MED_CONFIG,
    jwtSecret: !!process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    globalKeys,
    hasSelf: typeof self !== "undefined",
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = LoginSchema.parse(body);

    const { user, token } = await register(username, password);

    return NextResponse.json(
      { success: true, data: user },
      {
        status: 201,
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
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[register] Unhandled error:", msg, stack);
    return NextResponse.json(
      { success: false, error: "服务器内部错误", debug: msg },
      { status: 500 },
    );
  }
}
