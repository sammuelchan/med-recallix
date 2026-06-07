/**
 * Exam Domain Types — immersive Q&A quiz with AI scoring
 *
 * Unlike the MCQ quiz module, exams use open-ended questions where
 * the user types a free-text answer. AI evaluates similarity and
 * completeness against the reference answer.
 */

export interface ExamQuestion {
  id: string;
  question: string;
  referenceAnswer: string;
  /** "user" = from KP qaItems; "ai" = AI-generated extension/trap question */
  source: "user" | "ai";
  /** Category breadcrumb for context */
  category: string[];
  knowledgePointId?: string;
}

export interface ExamEvaluation {
  /** 0–100 similarity score */
  similarity: number;
  /** 0–100 completeness score */
  completeness: number;
  /** Weighted overall score (0–100) */
  overall: number;
  /** Brief AI feedback on the answer */
  feedback: string;
  /** Key points the user missed */
  missingPoints: string[];
}

export interface ExamAnswer {
  questionId: string;
  userAnswer: string;
  evaluation?: ExamEvaluation;
  /** Whether the user has viewed the reference answer */
  referenceViewed: boolean;
}

export interface ExamSession {
  questions: ExamQuestion[];
  answers: Record<string, ExamAnswer>;
  currentIndex: number;
  /** Category filter used when starting the exam */
  category: string | null;
  startedAt: string;
  finishedAt?: string;
}

export interface ExamResult {
  totalQuestions: number;
  answeredCount: number;
  averageSimilarity: number;
  averageCompleteness: number;
  averageOverall: number;
  /** Per-question breakdown */
  details: Array<{
    question: string;
    userAnswer: string;
    referenceAnswer: string;
    evaluation: ExamEvaluation;
  }>;
}

/** A persisted wrong-answer record for the wrong-answer book */
export interface WrongAnswer {
  id: string;
  question: string;
  referenceAnswer: string;
  userAnswer: string;
  evaluation: ExamEvaluation;
  source: "user" | "ai";
  category: string[];
  knowledgePointId?: string;
  /** ISO date string when the wrong answer was recorded */
  createdAt: string;
  /** Number of times this question has been answered wrong */
  wrongCount: number;
}

export interface WrongAnswerIndexItem {
  id: string;
  question: string;
  category: string[];
  overallScore: number;
  wrongCount: number;
  createdAt: string;
  updatedAt: string;
}
