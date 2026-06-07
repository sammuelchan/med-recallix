import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizService } from "@/modules/daily-quiz";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const data = await DailyQuizService.getTodayQuiz(userId);

    // If partial, trigger continuation in-band to progress toward ready
    if (data.status === "partial") {
      try {
        const updated = await DailyQuizService.continueGeneration(userId);
        return NextResponse.json({
          success: true,
          data: {
            ...data,
            status: updated.status,
            quiz: sanitizeQuiz(updated, data.progress),
          },
        });
      } catch {
        // Return partial data even if continuation fails
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...data, quiz: sanitizeQuiz(data.quiz, data.progress) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Strip answer/explanation from unanswered questions to prevent cheating.
 * Only reveal answers for questions the user has already submitted.
 */
function sanitizeQuiz(
  quiz: Awaited<ReturnType<typeof DailyQuizService.getTodayQuiz>>["quiz"],
  progress: Awaited<ReturnType<typeof DailyQuizService.getTodayQuiz>>["progress"],
) {
  if (!quiz) return null;
  const answeredIds = new Set(Object.keys(progress?.answers ?? {}));

  return {
    ...quiz,
    questions: quiz.questions.map((q) => {
      if (answeredIds.has(q.id)) return q;
      return { ...q, answer: undefined, explanation: undefined };
    }),
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const quiz = await DailyQuizService.generateDailyQuiz(userId);
    return NextResponse.json({ success: true, data: { status: quiz.status, quiz } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    const status = message.includes("知识点不足") ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
