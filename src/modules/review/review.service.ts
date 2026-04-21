import { kvGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import { generateId, toISODateString } from "@/shared/lib/utils";
import { NotFoundError } from "@/shared/lib/errors";
import { calculateNextReview, createCard, isDue } from "./sm2";
import { EpisodeService } from "@/modules/agent";
import type { Card, Deck, StreakData, DueSummary, ReviewGrade } from "./review.types";

// 复习服务  牌组操作
export const ReviewService = {
  async getDeck(userId: string): Promise<Deck> {
    // 从KV获取牌组，不存在则返回空牌组
    return (
      (await kvGet<Deck>(kvKeys.deck(userId))) ?? {
        userId,
        cards: [],
        updatedAt: new Date().toISOString(),
      }
    );
  },

  async addCard(
    userId: string,
    knowledgePointId: string,
    title: string,
  ): Promise<Card> {
    const deck = await this.getDeck(userId);
    // 检查是否已存在相同知识点的卡片
    const existing = deck.cards.find(
      (c) => c.knowledgePointId === knowledgePointId,
    );
    if (existing) return existing;

    const card = createCard(knowledgePointId, title, generateId());
    deck.cards.push(card);
    deck.updatedAt = new Date().toISOString();
    await kvPut(kvKeys.deck(userId), deck);
    return card;
  },

  async reviewCard(
    userId: string,
    cardId: string,
    grade: ReviewGrade,
  ): Promise<Card> {
    const deck = await this.getDeck(userId);
    const idx = deck.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new NotFoundError("卡片");

    const updated = calculateNextReview(deck.cards[idx], grade);
    if (!updated.reviewHistory) updated.reviewHistory = [];
    updated.reviewHistory.push({
      date: toISODateString(),
      grade,
      interval: updated.interval,
      efactor: updated.efactor,
    });
    // 如果复习历史超过50条，截取最后50条
    if (updated.reviewHistory.length > 50) {
      updated.reviewHistory = updated.reviewHistory.slice(-50);
    }
    deck.cards[idx] = updated;
    deck.updatedAt = new Date().toISOString();
    await kvPut(kvKeys.deck(userId), deck);

    // 副作用隔离：更新连续学习天数 并记录复习日志
    await this.updateStreak(userId);
    EpisodeService.trackReview(userId, updated.title).catch(() => {});

    return updated;
  },

  async getDueCards(userId: string): Promise<Card[]> {
    const deck = await this.getDeck(userId);
    return deck.cards.filter(isDue);
  },

  async getDueSummary(userId: string): Promise<DueSummary> {
    const deck = await this.getDeck(userId);
    const today = toISODateString();

    let due = 0;
    let overdue = 0;
    let newToday = 0;

    for (const card of deck.cards) {
      if (card.dueDate <= today) {
        if (card.repetition === 0) newToday++;
        else if (card.dueDate < today) overdue++;
        else due++;
      }
    }

    return { due, overdue, newToday, completed: 0 };
  },

  async getStreak(userId: string): Promise<StreakData> {
    return (
      (await kvGet<StreakData>(kvKeys.streak(userId))) ?? {
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: "",
        totalReviews: 0,
      }
    );
  },

  async updateStreak(userId: string): Promise<StreakData> {
    const streak = await this.getStreak(userId);
    const today = toISODateString();

    if (streak.lastStudyDate === today) {
      streak.totalReviews++;
      await kvPut(kvKeys.streak(userId), streak);
      return streak;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toISODateString(yesterday);

    if (streak.lastStudyDate === yesterdayStr) {
      streak.currentStreak++;
    } else {
      streak.currentStreak = 1;
    }

    streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
    streak.lastStudyDate = today;
    streak.totalReviews++;

    await kvPut(kvKeys.streak(userId), streak);
    return streak;
  },

  async getCardByKP(userId: string, knowledgePointId: string): Promise<Card | null> {
    const deck = await this.getDeck(userId);
    return deck.cards.find((c) => c.knowledgePointId === knowledgePointId) ?? null;
  },

  async removeCardByKP(userId: string, knowledgePointId: string): Promise<void> {
    const deck = await this.getDeck(userId);
    deck.cards = deck.cards.filter(
      (c) => c.knowledgePointId !== knowledgePointId,
    );
    deck.updatedAt = new Date().toISOString();
    await kvPut(kvKeys.deck(userId), deck);
  },
};
