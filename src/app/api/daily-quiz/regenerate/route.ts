import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizService } from "@/modules/daily-quiz";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const quiz = await DailyQuizService.regenerateQuiz(userId);

    return NextResponse.json({
      success: true,
      data: { status: quiz.status, quiz },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    const status = message.includes("已完成") ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
