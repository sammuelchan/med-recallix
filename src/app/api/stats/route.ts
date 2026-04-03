import { NextRequest, NextResponse } from "next/server";
import { ReviewService } from "@/modules/review";
import { KnowledgeService } from "@/modules/knowledge";
import { EpisodeService } from "@/modules/agent";
import { toISODateString } from "@/shared/lib/utils";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId)
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

  const [deck, kpIndex, streak, todayEpisode] = await Promise.all([
    ReviewService.getDeck(userId),
    KnowledgeService.getIndex(userId),
    ReviewService.getStreak(userId),
    EpisodeService.getEpisode(userId),
  ]);

  const today = toISODateString();
  const cards = deck.cards;
  const totalKP = kpIndex.length;
  const totalCards = cards.length;
  const mastered = cards.filter((c) => c.repetition >= 3 && c.efactor >= 2.5).length;
  const learning = cards.filter((c) => c.repetition > 0 && c.repetition < 3).length;
  const newCards = cards.filter((c) => c.repetition === 0).length;
  const dueToday = cards.filter((c) => c.dueDate <= today).length;

  const recentDays: { date: string; count: number; minutes: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = toISODateString(d);
    const ep = i === 0 ? todayEpisode : await EpisodeService.getEpisode(userId, dateStr);
    recentDays.push({
      date: dateStr,
      count: ep?.reviewedCount ?? 0,
      minutes: ep?.studyMinutes ?? 0,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      totalKP,
      totalCards,
      mastered,
      learning,
      newCards,
      dueToday,
      streak,
      todayEpisode,
      recentDays,
    },
  });
}
