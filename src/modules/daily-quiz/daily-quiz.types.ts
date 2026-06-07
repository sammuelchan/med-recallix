import type { QuizOption } from "@/modules/quiz";

export type DailyQuizStatus =
  | "generating"
  | "partial"
  | "ready"
  | "in_progress"
  | "completed";

export type QuestionSourceType = "error_review" | "weak_area" | "new_coverage";

export interface DailyQuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
  sourceKpId: string;
  sourceType: QuestionSourceType;
}

export interface DailyQuizSet {
  id: string;
  userId: string;
  date: string;
  status: DailyQuizStatus;
  questions: DailyQuizQuestion[];
  totalCount: number;
  readyCount: number;
  generatedAt: string;
  completedAt?: string;
}

export interface DailyQuizProgress {
  userId: string;
  date: string;
  currentIndex: number;
  answers: Record<string, string>;
  correctCount: number;
  startedAt: string;
  lastAnsweredAt: string;
}

export interface DailyQuizResult {
  userId: string;
  date: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  duration: number;
  weakCategories: { category: string; errorCount: number }[];
  errorKpIds: string[];
  comparedToYesterday?: number;
  streak: number;
  completedAt: string;
}

export interface ErrorWeightItem {
  kpId: string;
  kpTitle: string;
  category: string[];
  errorCount: number;
  lastErrorDate: string;
  consecutiveCorrect: number;
  graduated: boolean;
  weight: number;
}

export interface ErrorWeightIndex {
  userId: string;
  updatedAt: string;
  items: ErrorWeightItem[];
}

export interface CachedQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
  sourceKpId: string;
  cachedAt: string;
}

export interface QuizCachePool {
  userId: string;
  updatedAt: string;
  questions: CachedQuestion[];
}
