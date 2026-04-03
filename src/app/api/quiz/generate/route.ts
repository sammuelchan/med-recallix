import { NextRequest, NextResponse } from "next/server";
import { QuizService, GenerateQuizSchema } from "@/modules/quiz";
import { AppError } from "@/shared/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { knowledgePointIds, count } = GenerateQuizSchema.parse(body);

    const questions = await QuizService.generate(userId, knowledgePointIds, count);
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
