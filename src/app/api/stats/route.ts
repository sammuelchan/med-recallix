/**
 * Stats API Route — aggregate learning statistics for the dashboard
 *
 * Returns: KP count, card counts (mastered/learning/new/due), streak,
 * today's episode, and a 7-day activity chart (reviews + study minutes).
 *
 * Mastery criteria: repetition >= 3 AND efactor >= 2.5 (SM-2 threshold).
 *
 * Performance: all KV reads are fully parallelised — 7-day episodes use a
 * single batch-get round-trip instead of 6 sequential fetches.
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

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId)
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

  try {
    // Build the 7-day date list upfront
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(toISODateString(d));
    }
    const today = dates[dates.length - 1];

    // All KV reads in parallel: index + kp-index + streak + episodes + daily quiz results
    const [cardIndex, kpIndex, streak, episodes, ...quizResults] = await Promise.all([
      ReviewService.getCardIndex(userId),
      KnowledgeService.getIndex(userId),
      ReviewService.getStreak(userId),
      EpisodeService.getEpisodes(userId, dates),
      ...dates.map((d) => kvGet<DailyQuizResult>(kvKeys.dailyQuizResult(userId, d))),
    ]);

    const totalKP = kpIndex.length;
    const totalCards = cardIndex.length;
    const mastered = cardIndex.filter((c) => c.repetition >= 3 && c.efactor >= 2.5).length;
    const learning = cardIndex.filter((c) => c.repetition > 0 && c.repetition < 3).length;
    const newCards = cardIndex.filter((c) => c.repetition === 0).length;
    const dueToday = cardIndex.filter((c) => c.dueDate <= today).length;

    // Weighted progress: each card contributes proportionally to its learning stage
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

    const todayEpisode = episodes[episodes.length - 1];
    const recentDays = dates.map((date, idx) => ({
      date,
      count: episodes[idx]?.reviewedCount ?? 0,
      minutes: episodes[idx]?.studyMinutes ?? 0,
    }));

    const dailyQuizStats = {
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

    return jsonWithCache({
      success: true,
      data: {
        totalKP,
        totalCards,
        mastered,
        learning,
        newCards,
        dueToday,
        masteryPercent,
        streak,
        todayEpisode,
        recentDays,
        dailyQuizStats,
      },
    }, 10);
  } catch {
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
