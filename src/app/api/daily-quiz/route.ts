import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizService } from "@/modules/daily-quiz";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const data = await DailyQuizService.getTodayQuiz(userId);

    // 异步触发续生，不阻塞响应（避免 30s 超时）。
    // 节流由 continueGeneration 内部的 continuingAt 锁控制。
    // 注意: in_progress 状态下如果题目未生成完毕也需继续补全，
    // 因为 submitAnswer 会把 partial/ready → in_progress，但续生可能尚未完成。
    const needsContinuation = data.quiz
      && data.quiz.readyCount < data.quiz.totalCount
      && (data.status === "partial" || data.status === "in_progress");
    if (needsContinuation) {
      DailyQuizService.continueGeneration(userId).catch(() => {});
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

    let warning: string | undefined;
    if (quiz.readyCount === 0) {
      warning = "题目生成失败，请检查 AI 配置或为知识点添加 QA 问答";
    }

    // 和 GET 一样脱敏：不返回未答题目的答案/解析，防止作弊
    const sanitized = sanitizeQuiz(quiz, null);
    return NextResponse.json({ success: true, data: { status: quiz.status, quiz: sanitized, warning } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    const status = message.includes("知识点不足") ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
