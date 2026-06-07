/**
 * Exam Evaluation API Route
 *
 * POST /api/exam/evaluate → AI scores a user's free-text answer
 * against the reference answer on similarity and completeness.
 * If the score is below threshold, auto-saves to wrong-answer book server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { ExamService, WrongAnswerService, EvaluateAnswerSchema } from "@/modules/exam";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const input = EvaluateAnswerSchema.parse(body);

    const evaluation = await ExamService.evaluate(
      input.question,
      input.referenceAnswer,
      input.userAnswer,
    );

    // Server-side wrong-answer save (fire-and-forget, non-blocking)
    if (evaluation.overall < 80) {
      WrongAnswerService.save(userId, {
        question: input.question,
        referenceAnswer: input.referenceAnswer,
        userAnswer: input.userAnswer,
        evaluation,
        source: input.source ?? "user",
        category: input.category ?? [],
        knowledgePointId: input.knowledgePointId,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: { ...evaluation, savedToWrongBook: evaluation.overall < 80 },
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "输入格式有误" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
