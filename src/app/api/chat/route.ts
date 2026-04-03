import { NextRequest, NextResponse } from "next/server";
import { ChatService, SendMessageSchema } from "@/modules/chat";
import { AppError } from "@/shared/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const sessions = await ChatService.listSessions(userId);
    return NextResponse.json({ success: true, data: sessions });
  } catch (err) {
    if (err instanceof AppError)
      return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const input = SendMessageSchema.parse(body);

    const session = await ChatService.getOrCreateSession(userId, input.sessionId);
    const ts = new Date().toISOString();
    await ChatService.addMessage(userId, session.sessionId, {
      role: "user",
      content: input.message,
      timestamp: ts,
    });

    const result = input.bootstrap
      ? await ChatService.streamBootstrap(userId, session.sessionId)
      : await ChatService.streamReply(userId, session.sessionId, input.message);

    const res = result.toUIMessageStreamResponse();
    const headers = new Headers(res.headers);
    headers.set("x-chat-session-id", session.sessionId);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err) {
    if (err instanceof AppError)
      return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "输入格式有误" }, { status: 400 });
    }
    const raw = err instanceof Error ? err.message : "";
    if (raw === "NO_API_KEY") {
      return NextResponse.json({
        success: false,
        error: "尚未配置 AI API Key，请前往「设置」页面配置后再来对话",
        code: "NO_API_KEY",
      }, { status: 422 });
    }
    if (raw.toLowerCase().includes("only available for coding agents") || raw.toLowerCase().includes("access_terminated")) {
      return NextResponse.json({
        success: false,
        error: "当前模型不支持 Web 应用调用，请前往「设置」将模型改为 moonshot-v1-auto 或其他兼容模型",
        code: "MODEL_NOT_SUPPORTED",
      }, { status: 422 });
    }
    if (raw.toLowerCase().includes("insufficient balance") || raw.toLowerCase().includes("suspended") || raw.toLowerCase().includes("exceeded_current_quota")) {
      return NextResponse.json({
        success: false,
        error: "AI 账户余额不足，请前往 API 平台充值，或在「设置」中切换到其他 API",
        code: "INSUFFICIENT_BALANCE",
      }, { status: 422 });
    }
    if (raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("unauthorized") || raw.toLowerCase().includes("invalid")) {
      return NextResponse.json({
        success: false,
        error: "AI API Key 无效或已过期，请前往「设置」页面重新配置",
        code: "INVALID_API_KEY",
      }, { status: 422 });
    }
    return NextResponse.json({ success: false, error: raw || "服务器错误" }, { status: 500 });
  }
}
