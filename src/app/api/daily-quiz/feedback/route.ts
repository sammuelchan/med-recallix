import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizService } from "@/modules/daily-quiz";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { questionId, type, correctAnswer, comment } = body;

    if (!questionId || !type) {
      return NextResponse.json(
        { success: false, error: "缺少必填字段" },
        { status: 400 },
      );
    }

    const validTypes = ["wrong_answer", "irrelevant_options", "unclear_stem", "other"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "无效的反馈类型" },
        { status: 400 },
      );
    }

    await DailyQuizService.submitFeedback(userId, {
      questionId,
      type,
      correctAnswer,
      comment,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
