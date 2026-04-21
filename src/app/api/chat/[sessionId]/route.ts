import { NextRequest, NextResponse } from "next/server";
import { ChatService } from "@/modules/chat";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { sessionId } = await params;
    const messages = await ChatService.getHistory(userId, sessionId);
    return NextResponse.json({ success: true, data: messages });
  } catch (err) {
    if (err instanceof AppError)
      return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { sessionId } = await params;
    await ChatService.deleteSession(userId, sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AppError)
      return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
