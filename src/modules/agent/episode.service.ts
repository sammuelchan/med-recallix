/**
 * Episode Service — daily learning activity tracking
 *
 * Each day has a single DailyEpisode record in KV, keyed by userId + date.
 * Tracks study minutes, reviewed card count, quiz score, and topics covered.
 *
 * Uses an in-memory write buffer to coalesce rapid fire-and-forget updates
 * (e.g. multiple card reviews in quick succession) into a single KV write.
 */

import { kvGet, kvBatchGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import { toISODateString } from "@/shared/lib/utils";
import type { DailyEpisode } from "./agent.types";

const FLUSH_DELAY_MS = 2000;
const pendingFlush = new Map<string, { timeout: ReturnType<typeof setTimeout>; episode: DailyEpisode }>();

function scheduleFlush(userId: string, date: string, episode: DailyEpisode): void {
  const key = `${userId}:${date}`;
  const existing = pendingFlush.get(key);
  if (existing) {
    clearTimeout(existing.timeout);
    existing.episode = episode;
  }
  const timeout = setTimeout(async () => {
    const entry = pendingFlush.get(key);
    if (entry) {
      pendingFlush.delete(key);
      await kvPut(kvKeys.episode(userId, date), entry.episode).catch(() => {});
    }
  }, FLUSH_DELAY_MS);
  pendingFlush.set(key, { timeout, episode });
}

export const EpisodeService = {
  async getEpisode(
    userId: string,
    date: string = toISODateString(),
  ): Promise<DailyEpisode | null> {
    const key = `${userId}:${date}`;
    const pending = pendingFlush.get(key);
    if (pending) return pending.episode;
    return kvGet<DailyEpisode>(kvKeys.episode(userId, date));
  },

  /** Batch-fetch multiple episodes in a single KV round-trip. */
  async getEpisodes(
    userId: string,
    dates: string[],
  ): Promise<(DailyEpisode | null)[]> {
    if (dates.length === 0) return [];
    const keys = dates.map((d) => kvKeys.episode(userId, d));
    return kvBatchGet<DailyEpisode>(keys);
  },

  async updateEpisode(
    userId: string,
    update: Partial<DailyEpisode>,
  ): Promise<DailyEpisode> {
    const date = update.date ?? toISODateString();
    const existing = await this.getEpisode(userId, date);
    const base: DailyEpisode = existing ?? {
      date,
      studyMinutes: 0,
      reviewedCount: 0,
      topics: [],
    };
    const merged: DailyEpisode = { ...base, ...update, date };
    await kvPut(kvKeys.episode(userId, date), merged);
    return merged;
  },

  async trackReview(userId: string, topic: string): Promise<void> {
    const date = toISODateString();
    const ep = await this.getEpisode(userId, date);
    const base: DailyEpisode = ep ?? { date, studyMinutes: 0, reviewedCount: 0, topics: [] };
    base.reviewedCount += 1;
    if (topic && !base.topics.includes(topic)) {
      base.topics = [...base.topics, topic].slice(-20);
    }
    scheduleFlush(userId, date, base);
  },

  async trackStudyMinutes(userId: string, minutes: number): Promise<void> {
    const date = toISODateString();
    const ep = await this.getEpisode(userId, date);
    const base: DailyEpisode = ep ?? { date, studyMinutes: 0, reviewedCount: 0, topics: [] };
    base.studyMinutes += minutes;
    scheduleFlush(userId, date, base);
  },

  async trackQuizScore(userId: string, score: number): Promise<void> {
    const date = toISODateString();
    const ep = await this.getEpisode(userId, date);
    const base: DailyEpisode = ep ?? { date, studyMinutes: 0, reviewedCount: 0, topics: [] };
    base.quizScore = score;
    await kvPut(kvKeys.episode(userId, date), base);
  },
};
