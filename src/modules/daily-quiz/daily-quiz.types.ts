import type { QuizOption } from "@/modules/quiz";

export type DailyQuizStatus =
  | "generating"
  | "partial"
  | "ready"
  | "in_progress"
  | "completed";

export type QuestionSourceType = "error_review" | "weak_area" | "new_coverage";

export type QuestionGeneratedBy = "qa_pair" | "ai" | "cache";

export interface DailyQuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
  sourceKpId: string;
  sourceType: QuestionSourceType;
  generatedBy?: QuestionGeneratedBy;
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
  /** 续生开始时间戳；用作节流锁，60s 内不重复触发 AI 生成 */
  continuingAt?: string;
}

/**
 * 轻量答案索引 — 与完整 QuizSet 分离存储。
 *
 * 【用途】submitAnswer 热路径数据源，避免加载完整 QuizSet (~100KB)
 * 【存储】KV key: dqa_{userId}_{date}，大小 ~2KB
 * 【更新时机】generateDailyQuiz 首批生成后 + continueGeneration 每批追加后
 * 【性能收益】submit 延迟从 ~5s 降至 ~1-2s（见 §16.3）
 */
export interface DailyQuizAnswerKey {
  userId: string;
  date: string;
  /** questionId → { answer, explanation, sourceKpId, stem (first 30 chars for audit) } */
  keys: Record<string, {
    answer: string;
    explanation: string;
    sourceKpId: string;
    sourceType: QuestionSourceType;
    generatedBy?: QuestionGeneratedBy;
  }>;
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

// ─── Question Feedback (用户对题目质量的反馈) ─────────────────

export interface QuestionFeedback {
  questionId: string;
  userId: string;
  date: string;
  type: "wrong_answer" | "irrelevant_options" | "unclear_stem" | "other";
  correctAnswer?: string;
  comment?: string;
  createdAt: string;
}

export interface QuestionFeedbackIndex {
  userId: string;
  updatedAt: string;
  feedbacks: QuestionFeedback[];
}

// ─── Audit Log ─────────────────────────────────────────────

export type AuditEventType =
  | "generate_start"
  | "generate_batch_ok"
  | "generate_batch_fail"
  | "generate_fallback"
  | "generate_complete"
  | "continue_start"
  | "continue_ok"
  | "continue_fail"
  | "kp_insufficient"
  | "ai_key_missing";

export interface AuditLogEntry {
  timestamp: string;
  event: AuditEventType;
  detail: string;
  questionCount?: number;
  durationMs?: number;
  error?: string;
}

export interface DailyQuizAuditLog {
  userId: string;
  date: string;
  entries: AuditLogEntry[];
}
