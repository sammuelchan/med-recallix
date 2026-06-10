import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizService } from "@/modules/daily-quiz";
import { StatsSnapshotService } from "@/shared/services/stats-snapshot";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const result = await DailyQuizService.completeQuiz(userId);
    StatsSnapshotService.rebuildAsync(userId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
