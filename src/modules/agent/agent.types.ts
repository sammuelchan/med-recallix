/**
 * AI Agent Domain Types
 *
 * UserProfile   — study preferences and exam info collected during bootstrap
 * MemoryEntry   — single long-term memory fact (weakness, insight, milestone, etc.)
 * LongTermMemory — capped collection of memory entries with compaction tracking
 * DailyEpisode  — today's learning activity summary (minutes, reviews, quiz)
 * AgentContext  — assembled system prompt + message window passed to the LLM
 */

export interface UserProfile {
  nickname: string;
  examTarget: string;
  examDate?: string;
  preferredStudyTime?: string;
  dailyGoal: number;
  difficultyPreference: "easy" | "medium" | "hard";
  strongSubjects: string[];
  weakSubjects: string[];
  learningStyle?: string;
  createdAt: string;
  updatedAt: string;
}

export type MemoryCategory =
  | "weakness"
  | "strength"
  | "preference"
  | "milestone"
  | "correction"
  | "insight";

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: "high" | "medium" | "low";
  createdAt: string;
  source: string;
}

export interface LongTermMemory {
  entries: MemoryEntry[];
  lastCompactedAt: string;
}

export interface DailyEpisode {
  date: string;
  studyMinutes: number;
  reviewedCount: number;
  quizScore?: number;
  topics: string[];
  mood?: string;
  summary?: string;
}

export interface AgentContext {
  systemPrompt: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
}
