import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizService } from "@/modules/daily-quiz";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const quiz = await DailyQuizService.regenerateQuiz(userId);

    // 脱敏：不返回答案，防止作弊（regenerate 等同于重新生成）
    const sanitized = quiz
      ? {
          ...quiz,
          questions: (quiz.questions ?? []).map((q) => ({
            ...q,
            answer: undefined as string | undefined,
            explanation: undefined as string | undefined,
          })),
        }
      : quiz;

    return NextResponse.json({
      success: true,
      data: { status: quiz.status, quiz: sanitized },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    const status = message.includes("已完成") ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
