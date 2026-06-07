/**
 * Single Wrong Answer API Route
 *
 * GET    /api/exam/wrong-answers/:id → get full wrong answer detail
 * DELETE /api/exam/wrong-answers/:id → remove a single wrong answer
 */

import { NextRequest, NextResponse } from "next/server";
import { WrongAnswerService } from "@/modules/exam";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    const item = await WrongAnswerService.get(userId, id);
    if (!item) return NextResponse.json({ success: false, error: "记录不存在" }, { status: 404 });

    return NextResponse.json({ success: true, data: item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    await WrongAnswerService.remove(userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
