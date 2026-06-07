/**
 * Exam Generation API Route
 *
 * POST /api/exam/generate → generates open-ended Q&A questions from
 * knowledge points in the selected category. Combines user's existing
 * Q&A pairs with AI-generated extension and trap questions.
 */

import { NextRequest, NextResponse } from "next/server";
import { ExamService, GenerateExamSchema } from "@/modules/exam";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { category, count } = GenerateExamSchema.parse(body);

    const questions = await ExamService.generate(userId, category, count);
    return NextResponse.json({ success: true, data: questions });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "输入格式有误" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
