/**
 * Quiz Domain Types
 *
 * QuizOption   — single answer option (label A–E + text)
 * QuizQuestion — one MCQ with stem, options, correct answer, and explanation
 * QuizSession  — client-side quiz state (questions, user answers, final score)
 */

export interface QuizOption {
  label: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
  knowledgePointId?: string;
}

export interface QuizSession {
  questions: QuizQuestion[];
  answers: Record<string, string>;
  score?: number;
}
