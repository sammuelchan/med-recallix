import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/shared/lib/get-user-id";
import { DailyQuizAuditService } from "@/modules/daily-quiz/daily-quiz.audit";
import { jsonWithCache } from "@/shared/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId)
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const logs = await DailyQuizAuditService.getRecentLogs(userId);

    return jsonWithCache({ success: true, data: logs }, 5);
  } catch {
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
