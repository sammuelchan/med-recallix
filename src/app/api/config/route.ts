import { NextRequest, NextResponse } from "next/server";
import { getAIConfig, setAIConfig } from "@/shared/infrastructure/ai";
import { maskApiKey } from "@/shared/lib/validators";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const config = await getAIConfig();
    return NextResponse.json({
      success: true,
      data: {
        baseURL: config.baseURL,
        model: config.model,
        apiKey: config.apiKey ? maskApiKey(config.apiKey) : "",
        hasKey: !!config.apiKey,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const update: Record<string, string> = {};
    if (body.baseURL) update.baseURL = body.baseURL;
    if (body.model) update.model = body.model;
    if (body.apiKey) update.apiKey = body.apiKey;

    const config = await setAIConfig(update);
    return NextResponse.json({
      success: true,
      data: {
        baseURL: config.baseURL,
        model: config.model,
        apiKey: maskApiKey(config.apiKey),
        hasKey: !!config.apiKey,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
