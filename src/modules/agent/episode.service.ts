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
