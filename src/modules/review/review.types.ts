/**
 * Review Domain Types
 *
 * Card          — SM-2 flashcard with scheduling state and optional review history
 * Deck          — per-user collection of all cards
 * StreakData    — consecutive study day tracking
 * DueSummary    — dashboard card counts (due/overdue/new)
 * ReviewGrade   — SM-2 grade scale 0–5
 * ReviewMode    — card display mode: traditional card, Q&A, or fill-blank
 * QAReviewState — per-QA-item review tracking within a card
 */

export interface ReviewLog {
  date: string;
  grade: ReviewGrade;
  interval: number;
  efactor: number;
}

export type ReviewMode = "card" | "qa" | "fill-blank";

export interface QAReviewState {
  qaId: string;
  remembered: boolean;
  lastReviewDate?: string;
}

export interface Card {
  id: string;
  knowledgePointId: string;
  title: string;
  interval: number;
  repetition: number;
  efactor: number;
  dueDate: string;
  lastReviewDate?: string;
  reviewHistory?: ReviewLog[];
  reviewMode?: ReviewMode;
  qaStates?: QAReviewState[];
}

export interface Deck {
  userId: string;
  cards: Card[];
  updatedAt: string;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string;
  totalReviews: number;
}

export interface DueSummary {
  due: number;
  overdue: number;
  newToday: number;
  completed: number;
}

export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * CardIndexItem — lightweight summary stored in deck index for fast queries.
 * The full Card (with reviewHistory) is stored separately per card.
 */
export interface CardIndexItem {
  id: string;
  knowledgePointId: string;
  title: string;
  dueDate: string;
  repetition: number;
  interval: number;
  efactor: number;
}
