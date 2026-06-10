/**
 * Stats Snapshot Service — pre-computed statistics stored in KV.
 *
 * Instead of computing stats on every page view (14+ KV reads),
 * we materialize the result after each write operation (review, quiz completion)
 * and serve it in a single KV read (~50ms).
 *
 * Storage: ONE snapshot per user (`stats_{userId}`), overwritten on each rebuild.
 * No historical versions are kept — this is a cache, not an audit log.
 *
 * Rebuild is idempotent and safe to call concurrently (last-write-wins).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ IMPORTANT: When adding features that affect learning statistics     │
 * │ (new card types, new quiz modes, additional metrics), you MUST      │
 * │ update the StatsSnapshot interface and rebuild() logic here, AND    │
 * │ add StatsSnapshotService.rebuildAsync(userId) to the new feature's  │
 * │ write API route. See existing call sites:                           │
 * │   - PUT  /api/cards/[id]           (after review)                   │
 * │   - POST /api/daily-quiz/complete  (after quiz completion)          │
 * │   - POST /api/knowledge            (after KP creation)             │
 * │   - DELETE /api/knowledge/[id]     (after KP deletion)             │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { kvGet, kvPut, kvBatchGet, kvKeys } from "@/shared/infrastructure/kv";
import { ReviewService } from "@/modules/review";
import { KnowledgeService } from "@/modules/knowledge";
import { EpisodeService } from "@/modules/agent";
import { DailyQuizService } from "@/modules/daily-quiz";
import { toISODateString } from "@/shared/lib/utils";
import type { DailyQuizResult } from "@/modules/daily-quiz";
import type { StreakData } from "@/modules/review";
import type { DailyEpisode } from "@/modules/agent";

export interface StatsSnapshot {
  core: {
    totalKP: number;
    totalCards: number;
    mastered: number;
    learning: number;
    newCards: number;
    dueToday: number;
    masteryPercent: number;
    streak: StreakData;
  };
  chart: {
    todayEpisode: DailyEpisode | null;
    recentDays: { date: string; count: number; minutes: number }[];
  };
  quiz: {
    recentResults: { date: string; accuracy: number | null; completed: boolean }[];
    streak: number;
    todayCompleted: boolean;
    todayAccuracy: number | null;
  };
  updatedAt: string;
}

function buildDates(): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toISODateString(d));
  }
  return dates;
}

export const StatsSnapshotService = {
  /**
   * Read the cached snapshot. Returns null if missing or stale (different day).
   * Only ONE snapshot per user exists — no storage accumulation.
   */
  async get(userId: string): Promise<StatsSnapshot | null> {
    const snapshot = await kvGet<StatsSnapshot>(kvKeys.statsSnapshot(userId));
    if (!snapshot) return null;

    const today = toISODateString();
    if (!snapshot.updatedAt.startsWith(today)) return null;

    return snapshot;
  },

  /**
   * Rebuild the full stats snapshot. Called after write operations
   * (review, quiz completion, KP creation/deletion).
   * Fire-and-forget — never block user-facing responses on this.
   */
  async rebuild(userId: string): Promise<void> {
    const dates = buildDates();
    const today = dates[dates.length - 1];

    const [cardIndex, kpIndex, streak, episodes, ...quizResults] = await Promise.all([
      ReviewService.getCardIndex(userId),
      KnowledgeService.getIndex(userId),
      ReviewService.getStreak(userId),
      EpisodeService.getEpisodes(userId, dates),
      ...dates.map((d) => kvGet<DailyQuizResult>(kvKeys.dailyQuizResult(userId, d))),
    ]);

    // Core stats
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

    // Chart stats
    const todayEpisode = episodes[episodes.length - 1];
    const recentDays = dates.map((date, idx) => ({
      date,
      count: episodes[idx]?.reviewedCount ?? 0,
      minutes: episodes[idx]?.studyMinutes ?? 0,
    }));

    // Quiz stats — derive streak from the 7-day data to avoid extra KV reads
    const hasAnyQuiz = quizResults.some((r) => r != null);
    let quizStreak = 0;
    if (hasAnyQuiz) {
      // Count backwards from today until a gap
      for (let i = quizResults.length - 1; i >= 0; i--) {
        if (quizResults[i] != null) quizStreak++;
        else break;
      }
      // If all 7 days are filled, we need deeper lookup
      if (quizStreak === 7) {
        quizStreak = await DailyQuizService.calculateStreak(userId, today);
      }
    }

    const snapshot: StatsSnapshot = {
      core: { totalKP, totalCards, mastered, learning, newCards, dueToday, masteryPercent, streak },
      chart: { todayEpisode, recentDays },
      quiz: {
        recentResults: dates.map((date, idx) => ({
          date,
          accuracy: quizResults[idx]?.accuracy ?? null,
          completed: quizResults[idx] != null,
        })),
        streak: quizStreak,
        todayCompleted: quizResults[quizResults.length - 1] != null,
        todayAccuracy: quizResults[quizResults.length - 1]?.accuracy ?? null,
      },
      updatedAt: new Date().toISOString(),
    };

    await kvPut(kvKeys.statsSnapshot(userId), snapshot);
  },

  /**
   * Trigger rebuild without awaiting (fire-and-forget).
   * Call this from any write API route that mutates learning data.
   * Also called on snapshot read as compensation — ensures freshness
   * even if a prior write-triggered rebuild was lost.
   */
  rebuildAsync(userId: string): void {
    this.rebuild(userId).catch((err) => {
      console.warn("[StatsSnapshot] rebuild failed:", err);
    });
  },
};
