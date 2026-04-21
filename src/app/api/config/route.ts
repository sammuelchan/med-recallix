/**
 * Config API Route — AI provider settings
 *
 * GET /api/config → read current AI config (API key is masked for display)
 * PUT /api/config → update AI base URL, model name, and/or API key
 *
 * Settings are persisted in KV and survive redeployments.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAIConfig, setAIConfig } from "@/shared/infrastructure/ai";
import { maskApiKey } from "@/shared/lib/validators";
import { getUserId } from "@/shared/lib/get-user-id";

/** GET — return AI config with masked API key. */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
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

/** PUT — merge partial update into AI config and persist to KV. */
export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserId(req);
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
