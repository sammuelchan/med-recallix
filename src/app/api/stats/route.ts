/**
 * Stats API Route — aggregate learning statistics for the dashboard
 *
 * Supports sectioned queries via `?section=` for progressive loading:
 *   - core    → KP/card counts, streak, mastery (fast: 2-3 KV reads)
 *   - chart   → 7-day activity data (episodes)
 *   - quiz    → daily quiz stats (7 KV reads)
 *   - (none)  → all sections combined (legacy full response)
 *
 * Mastery criteria: repetition >= 3 AND efactor >= 2.5 (SM-2 threshold).
 */

import { NextRequest, NextResponse } from "next/server";
import { ReviewService } from "@/modules/review";
import { KnowledgeService } from "@/modules/knowledge";
import { EpisodeService } from "@/modules/agent";
import { DailyQuizService } from "@/modules/daily-quiz";
import { toISODateString } from "@/shared/lib/utils";
import { getUserId } from "@/shared/lib/get-user-id";
import { jsonWithCache } from "@/shared/lib/api-response";
import { kvGet, kvKeys } from "@/shared/infrastructure/kv";
import type { DailyQuizResult } from "@/modules/daily-quiz";

function buildDates(): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toISODateString(d));
  }
  return dates;
}

async function getCoreStats(userId: string, today: string) {
  const [cardIndex, kpIndex, streak] = await Promise.all([
    ReviewService.getCardIndex(userId),
    KnowledgeService.getIndex(userId),
    ReviewService.getStreak(userId),
  ]);

  const totalKP = kpIndex.length;
  const totalCards = cardIndex.length;
  const mastered = cardIndex.filter((c) => c.repetition >= 3 && c.efactor >= 2.5).length;
  const learning = cardIndex.filter((c) => c.repetition > 0 && c.repetition < 3).length;
  const newCards = cardIndex.filter((c) => c.repetition === 0).length;
  const dueToday = cardIndex.filter((c) => c.dueDate <= today).length;

  let progressScore = 0;
  for (const c of cardIndex) {
    if (c.repetition >= 3 && c.efactor >= 2.5) progressScore += 1;
    else if (c.repetition >= 3) progressScore += 0.75;
    else if (c.repetition === 2) progressScore += 0.5;
    else if (c.repetition === 1) progressScore += 0.25;
  }
  const masteryPercent = totalCards > 0
    ? Math.round((progressScore / totalCards) * 100)
    : 0;

  return { totalKP, totalCards, mastered, learning, newCards, dueToday, masteryPercent, streak };
}

async function getChartStats(userId: string, dates: string[]) {
  const episodes = await EpisodeService.getEpisodes(userId, dates);
  const todayEpisode = episodes[episodes.length - 1];
  const recentDays = dates.map((date, idx) => ({
    date,
    count: episodes[idx]?.reviewedCount ?? 0,
    minutes: episodes[idx]?.studyMinutes ?? 0,
  }));
  return { todayEpisode, recentDays };
}

async function getQuizStats(userId: string, dates: string[], today: string) {
  const quizResults = await Promise.all(
    dates.map((d) => kvGet<DailyQuizResult>(kvKeys.dailyQuizResult(userId, d))),
  );

  return {
    recentResults: dates.map((date, idx) => ({
      date,
      accuracy: quizResults[idx]?.accuracy ?? null,
      completed: quizResults[idx] != null,
    })),
    streak: quizResults.filter((r) => r != null).length > 0
      ? await DailyQuizService.calculateStreak(userId, today)
      : 0,
    todayCompleted: quizResults[quizResults.length - 1] != null,
    todayAccuracy: quizResults[quizResults.length - 1]?.accuracy ?? null,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId)
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

  const section = req.nextUrl.searchParams.get("section");
  const dates = buildDates();
  const today = dates[dates.length - 1];

  try {
    if (section === "core") {
      const data = await getCoreStats(userId, today);
      return jsonWithCache({ success: true, data }, 30);
    }

    if (section === "chart") {
      const data = await getChartStats(userId, dates);
      return jsonWithCache({ success: true, data }, 30);
    }

    if (section === "quiz") {
      const data = await getQuizStats(userId, dates, today);
      return jsonWithCache({ success: true, data }, 30);
    }

    // Legacy: return all sections combined
    const [core, chart, quiz] = await Promise.all([
      getCoreStats(userId, today),
      getChartStats(userId, dates),
      getQuizStats(userId, dates, today),
    ]);

    return jsonWithCache({
      success: true,
      data: {
        ...core,
        ...chart,
        dailyQuizStats: quiz,
      },
    }, 10);
  } catch {
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
