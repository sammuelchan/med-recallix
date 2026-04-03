export interface ReviewLog {
  date: string;
  grade: ReviewGrade;
  interval: number;
  efactor: number;
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
