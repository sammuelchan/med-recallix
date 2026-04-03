import { kvGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import type { UserProfile } from "./agent.types";

export const ProfileService = {
  async getProfile(userId: string): Promise<UserProfile | null> {
    return kvGet<UserProfile>(kvKeys.profile(userId));
  },

  async hasProfile(userId: string): Promise<boolean> {
    const p = await this.getProfile(userId);
    return p !== null;
  },

  async updateProfile(
    userId: string,
    update: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    const now = new Date().toISOString();

    if (!existing) {
      const created: UserProfile = {
        nickname: update.nickname ?? "主人",
        examTarget: update.examTarget ?? "",
        examDate: update.examDate,
        preferredStudyTime: update.preferredStudyTime,
        dailyGoal: update.dailyGoal ?? 30,
        difficultyPreference: update.difficultyPreference ?? "medium",
        strongSubjects: update.strongSubjects ?? [],
        weakSubjects: update.weakSubjects ?? [],
        learningStyle: update.learningStyle,
        ...update,
        createdAt: now,
        updatedAt: now,
      };
      await kvPut(kvKeys.profile(userId), created);
      return created;
    }

    const merged: UserProfile = {
      ...existing,
      ...update,
      updatedAt: now,
    };
    await kvPut(kvKeys.profile(userId), merged);
    return merged;
  },
};
