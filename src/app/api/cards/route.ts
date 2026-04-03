import { NextRequest, NextResponse } from "next/server";
import { ReviewService } from "@/modules/review";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const isSummary =
      req.nextUrl.searchParams.get("status") === "summary" ||
      req.nextUrl.searchParams.get("summary") === "true";

    const isStreak = req.nextUrl.searchParams.get("streak") === "true";

    if (isStreak) {
      const streak = await ReviewService.getStreak(userId);
      return NextResponse.json({ success: true, data: streak });
    }

    if (isSummary) {
      const [summary, streak, deck] = await Promise.all([
        ReviewService.getDueSummary(userId),
        ReviewService.getStreak(userId),
        ReviewService.getDeck(userId),
      ]);
      return NextResponse.json({
        success: true,
        data: { summary: { ...summary, total: deck.cards.length }, streak },
      });
    }

    const cards = await ReviewService.getDueCards(userId);
    return NextResponse.json({ success: true, data: cards });
  } catch {
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
