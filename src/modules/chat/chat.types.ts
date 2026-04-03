export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  sessionId: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  summary?: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface ChatSessionIndex {
  sessionId: string;
  title: string;
  lastMessageAt: string;
}
