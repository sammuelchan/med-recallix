/**
 * Wrong Answers API Route
 *
 * GET  /api/exam/wrong-answers           → list wrong answers (optional ?category= filter)
 * POST /api/exam/wrong-answers           → save a wrong answer
 * DELETE /api/exam/wrong-answers         → clear all wrong answers
 */

import { NextRequest, NextResponse } from "next/server";
import { WrongAnswerService } from "@/modules/exam";
import { SaveWrongAnswerSchema } from "@/modules/exam/exam.schema";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const full = req.nextUrl.searchParams.get("full") === "true";

    const items = full
      ? await WrongAnswerService.listFull(userId, category)
      : await WrongAnswerService.list(userId, category);
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const input = SaveWrongAnswerSchema.parse(body);
    const result = await WrongAnswerService.save(userId, input);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    await WrongAnswerService.clear(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
