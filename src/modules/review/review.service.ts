import { kvGet, kvBatchGet, kvPut, kvDelete, kvKeys } from "@/shared/infrastructure/kv";
import { generateId, toISODateString } from "@/shared/lib/utils";
import { NotFoundError } from "@/shared/lib/errors";
import { calculateNextReview, createCard } from "./sm2";
import { EpisodeService } from "@/modules/agent";
import type {
  Card,
  Deck,
  CardIndexItem,
  StreakData,
  DueSummary,
  ReviewGrade,
} from "./review.types";

/**
 * Review Service — spaced repetition deck management (sharded storage)
 *
 * Storage layout:
 *   deck_idx_{userId}  → CardIndexItem[] (lightweight, for due queries)
 *   card_{userId}_{id} → Card (full SM-2 state + review history)
 *   streak_{userId}    → StreakData
 *
 * Migration: on first access, if old monolithic `deck_{userId}` exists,
 * it is split into individual card records + index, then the old key is deleted.
 */
export const ReviewService = {
  async getCardIndex(userId: string): Promise<CardIndexItem[]> {
    const index = await kvGet<CardIndexItem[]>(kvKeys.deckIndex(userId));
    if (index) return index;

    // Migration: check for old monolithic deck
    const oldDeck = await kvGet<Deck>(kvKeys.deck(userId));
    if (oldDeck && oldDeck.cards.length > 0) {
      return this.migrateFromMonolithicDeck(userId, oldDeck);
    }

    return [];
  },

  async migrateFromMonolithicDeck(
    userId: string,
    oldDeck: Deck,
  ): Promise<CardIndexItem[]> {
    const index: CardIndexItem[] = [];
    const writes: Promise<void>[] = [];

    for (const card of oldDeck.cards) {
      index.push({
        id: card.id,
        knowledgePointId: card.knowledgePointId,
        title: card.title,
        dueDate: card.dueDate,
        repetition: card.repetition,
        interval: card.interval,
        efactor: card.efactor,
      });
      writes.push(kvPut(kvKeys.card(userId, card.id), card));
    }

    writes.push(kvPut(kvKeys.deckIndex(userId), index));
    await Promise.all(writes);

    // Clean up old monolithic key (fire-and-forget)
    kvDelete(kvKeys.deck(userId)).catch(() => {});

    return index;
  },

  async getCard(userId: string, cardId: string): Promise<Card | null> {
    return kvGet<Card>(kvKeys.card(userId, cardId));
  },

  async addCard(
    userId: string,
    knowledgePointId: string,
    title: string,
  ): Promise<Card> {
    const index = await this.getCardIndex(userId);
    const existing = index.find((c) => c.knowledgePointId === knowledgePointId);
    if (existing) {
      const card = await this.getCard(userId, existing.id);
      return card!;
    }

    const card = createCard(knowledgePointId, title, generateId());
    const indexItem: CardIndexItem = {
      id: card.id,
      knowledgePointId: card.knowledgePointId,
      title: card.title,
      dueDate: card.dueDate,
      repetition: card.repetition,
      interval: card.interval,
      efactor: card.efactor,
    };

    index.push(indexItem);

    // Parallel: write card + update index
    await Promise.all([
      kvPut(kvKeys.card(userId, card.id), card),
      kvPut(kvKeys.deckIndex(userId), index),
    ]);

    return card;
  },

  async reviewCard(
    userId: string,
    cardId: string,
    grade: ReviewGrade,
  ): Promise<Card> {
    // Parallel read: card + index + streak
    const [card, index, streak] = await Promise.all([
      this.getCard(userId, cardId),
      this.getCardIndex(userId),
      this.getStreak(userId),
    ]);

    if (!card) throw new NotFoundError("卡片");

    const updated = calculateNextReview(card, grade);
    if (!updated.reviewHistory) updated.reviewHistory = [];
    updated.reviewHistory.push({
      date: toISODateString(),
      grade,
      interval: updated.interval,
      efactor: updated.efactor,
    });
    if (updated.reviewHistory.length > 50) {
      updated.reviewHistory = updated.reviewHistory.slice(-50);
    }

    // Update index entry
    const idx = index.findIndex((c) => c.id === cardId);
    if (idx >= 0) {
      index[idx] = {
        ...index[idx],
        dueDate: updated.dueDate,
        repetition: updated.repetition,
        interval: updated.interval,
        efactor: updated.efactor,
      };
    }

    // Update streak inline
    const today = toISODateString();
    if (streak.lastStudyDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = toISODateString(yesterday);
      if (streak.lastStudyDate === yesterdayStr) {
        streak.currentStreak++;
      } else {
        streak.currentStreak = 1;
      }
      streak.longestStreak = Math.max(
        streak.longestStreak,
        streak.currentStreak,
      );
      streak.lastStudyDate = today;
    }
    streak.totalReviews++;

    // Parallel write: card + index + streak
    await Promise.all([
      kvPut(kvKeys.card(userId, cardId), updated),
      kvPut(kvKeys.deckIndex(userId), index),
      kvPut(kvKeys.streak(userId), streak),
    ]);

    EpisodeService.trackReview(userId, updated.title).catch(() => {});

    return updated;
  },

  async getDueCards(userId: string): Promise<Card[]> {
    const index = await this.getCardIndex(userId);
    const today = toISODateString();
    const dueItems = index.filter((item) => item.dueDate <= today);

    if (dueItems.length === 0) return [];

    // Single batch read for all due cards
    const keys = dueItems.map((item) => kvKeys.card(userId, item.id));
    const cards = await kvBatchGet<Card>(keys);

    return cards.filter((c): c is Card => c !== null);
  },

  async getDueSummary(userId: string): Promise<DueSummary> {
    const index = await this.getCardIndex(userId);
    const today = toISODateString();

    let due = 0;
    let overdue = 0;
    let newToday = 0;

    for (const item of index) {
      if (item.dueDate <= today) {
        if (item.repetition === 0) newToday++;
        else if (item.dueDate < today) overdue++;
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

    streak.longestStreak = Math.max(
      streak.longestStreak,
      streak.currentStreak,
    );
    streak.lastStudyDate = today;
    streak.totalReviews++;

    await kvPut(kvKeys.streak(userId), streak);
    return streak;
  },

  async getCardByKP(
    userId: string,
    knowledgePointId: string,
  ): Promise<Card | null> {
    const index = await this.getCardIndex(userId);
    const item = index.find((c) => c.knowledgePointId === knowledgePointId);
    if (!item) return null;
    return this.getCard(userId, item.id);
  },

  async removeCardByKP(
    userId: string,
    knowledgePointId: string,
  ): Promise<void> {
    const index = await this.getCardIndex(userId);
    const item = index.find((c) => c.knowledgePointId === knowledgePointId);
    if (!item) return;

    const filtered = index.filter(
      (c) => c.knowledgePointId !== knowledgePointId,
    );

    // Parallel: delete card + update index
    await Promise.all([
      kvDelete(kvKeys.card(userId, item.id)),
      kvPut(kvKeys.deckIndex(userId), filtered),
    ]);
  },

  async syncCardTitle(
    userId: string,
    knowledgePointId: string,
    newTitle: string,
  ): Promise<void> {
    const index = await this.getCardIndex(userId);
    const item = index.find((c) => c.knowledgePointId === knowledgePointId);
    if (!item || item.title === newTitle) return;

    // Update index
    item.title = newTitle;

    // Update full card
    const card = await this.getCard(userId, item.id);
    if (card) {
      card.title = newTitle;
      await Promise.all([
        kvPut(kvKeys.card(userId, item.id), card),
        kvPut(kvKeys.deckIndex(userId), index),
      ]);
    } else {
      await kvPut(kvKeys.deckIndex(userId), index);
    }
  },

  /** Get total card count (used by dashboard summary). */
  async getCardCount(userId: string): Promise<number> {
    const index = await this.getCardIndex(userId);
    return index.length;
  },

  /** Reset a card's due date to today so it can be reviewed immediately. */
  async resetCardDueDate(userId: string, cardId: string): Promise<void> {
    const today = toISODateString();
    const [card, index] = await Promise.all([
      this.getCard(userId, cardId),
      this.getCardIndex(userId),
    ]);

    if (!card) throw new NotFoundError("卡片");

    card.dueDate = today;
    const indexItem = index.find((c) => c.id === cardId);
    if (indexItem) indexItem.dueDate = today;

    await Promise.all([
      kvPut(kvKeys.card(userId, cardId), card),
      kvPut(kvKeys.deckIndex(userId), index),
    ]);
  },
};
