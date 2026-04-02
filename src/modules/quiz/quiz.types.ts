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
