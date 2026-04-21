/**
 * Episode Service — daily learning activity tracking
 *
 * Each day has a single DailyEpisode record in KV, keyed by userId + date.
 * Tracks study minutes, reviewed card count, quiz score, and topics covered.
 *
 * Called as a side effect from:
 *   - ReviewService.reviewCard → trackReview (increment reviewed count + topic)
 *   - ChatService.runPostReplyTasks → trackStudyMinutes (increment by 1)
 *   - Quiz page → trackQuizScore (after quiz completion)
 *
 * Data feeds the Stats dashboard and the agent's daily context block.
 */

import { kvGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import { toISODateString } from "@/shared/lib/utils";
import type { DailyEpisode } from "./agent.types";

export const EpisodeService = {
  async getEpisode(
    userId: string,
    date: string = toISODateString(),
  ): Promise<DailyEpisode | null> {
    return kvGet<DailyEpisode>(kvKeys.episode(userId, date));
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
    await kvPut(kvKeys.episode(userId, date), base);
  },

  async trackStudyMinutes(userId: string, minutes: number): Promise<void> {
    const date = toISODateString();
    const ep = await this.getEpisode(userId, date);
    const base: DailyEpisode = ep ?? { date, studyMinutes: 0, reviewedCount: 0, topics: [] };
    base.studyMinutes += minutes;
    await kvPut(kvKeys.episode(userId, date), base);
  },

  async trackQuizScore(userId: string, score: number): Promise<void> {
    const date = toISODateString();
    const ep = await this.getEpisode(userId, date);
    const base: DailyEpisode = ep ?? { date, studyMinutes: 0, reviewedCount: 0, topics: [] };
    base.quizScore = score;
    await kvPut(kvKeys.episode(userId, date), base);
  },
};
