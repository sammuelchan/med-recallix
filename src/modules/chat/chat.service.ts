/**
 * Chat Service — AI conversation management with multi-layer memory
 *
 * Core responsibilities:
 *   1. Session CRUD — create, list, get history, delete sessions
 *   2. AI streaming  — streamReply (normal) and streamBootstrap (first-run profile setup)
 *   3. Post-reply tasks (fire-and-forget):
 *      a. Memory extraction — LLM analyses the exchange for memorable facts
 *      b. Session compaction — when messages exceed 40, older messages are
 *         summarised and replaced with a compressed summary string
 *      c. Episode tracking — increments daily study minutes
 *
 * Data model:
 *   Session record → kvKeys.chatSession(userId, sessionId) → ChatSession
 *   Session index  → kvKeys.chatIndex(userId)               → ChatSessionIndex[]
 *
 * The session title is auto-set to the first 20 chars of the first user message.
 */

import { streamText, generateText } from "ai";
import { buildAgentContext, BOOTSTRAP_PROMPT } from "@/modules/agent";
import { MemoryService, EpisodeService } from "@/modules/agent";
import { createAIClient, getAIConfig, type AIConfig } from "@/shared/infrastructure/ai";
import { kvDelete, kvGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import { NotFoundError } from "@/shared/lib/errors";
import { generateId } from "@/shared/lib/utils";
import type { ChatMessage, ChatSession, ChatSessionIndex } from "./chat.types";

/** Insert or update a session entry in the user's session index. */
async function upsertIndex(userId: string, entry: ChatSessionIndex): Promise<void> {
  const index =
    (await kvGet<ChatSessionIndex[]>(kvKeys.chatIndex(userId))) ?? [];
  const i = index.findIndex((e) => e.sessionId === entry.sessionId);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  await kvPut(kvKeys.chatIndex(userId), index);
}

export const ChatService = {
  async getOrCreateSession(
    userId: string,
    sessionId?: string,
  ): Promise<ChatSession> {
    const now = new Date().toISOString();
    if (sessionId && sessionId !== "new") {
      const existing = await kvGet<ChatSession>(
        kvKeys.chatSession(userId, sessionId),
      );
      if (existing) return existing;
      throw new NotFoundError("对话");
    }

    const id = generateId();
    const session: ChatSession = {
      sessionId: id,
      userId,
      title: "新对话",
      messages: [],
      createdAt: now,
      lastMessageAt: now,
    };
    await kvPut(kvKeys.chatSession(userId, id), session);
    await upsertIndex(userId, {
      sessionId: id,
      title: session.title,
      lastMessageAt: now,
    });
    return session;
  },

  async addMessage(
    userId: string,
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    const session = await kvGet<ChatSession>(
      kvKeys.chatSession(userId, sessionId),
    );
    if (!session) throw new NotFoundError("对话");

    session.messages.push(message);
    session.lastMessageAt = message.timestamp;

    if (session.title === "新对话" && message.role === "user") {
      const userCount = session.messages.filter((m) => m.role === "user")
        .length;
      if (userCount === 1) {
        session.title = message.content.slice(0, 20);
      }
    }

    await kvPut(kvKeys.chatSession(userId, sessionId), session);
    await upsertIndex(userId, {
      sessionId,
      title: session.title,
      lastMessageAt: session.lastMessageAt,
    });
  },

  async listSessions(userId: string): Promise<ChatSessionIndex[]> {
    const index =
      (await kvGet<ChatSessionIndex[]>(kvKeys.chatIndex(userId))) ?? [];
    return [...index].sort((a, b) =>
      a.lastMessageAt < b.lastMessageAt ? 1 : -1,
    );
  },

  async getHistory(userId: string, sessionId: string): Promise<ChatMessage[]> {
    const session = await kvGet<ChatSession>(
      kvKeys.chatSession(userId, sessionId),
    );
    if (!session) throw new NotFoundError("对话");
    return session.messages;
  },

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await kvDelete(kvKeys.chatSession(userId, sessionId));
    const index =
      (await kvGet<ChatSessionIndex[]>(kvKeys.chatIndex(userId))) ?? [];
    await kvPut(
      kvKeys.chatIndex(userId),
      index.filter((e) => e.sessionId !== sessionId),
    );
  },

  /**
   * Stream an AI reply in a normal conversation session.
   * Builds full agent context (soul + profile + memories + episode + history)
   * and returns a Vercel AI SDK streaming response.
   * On finish: saves assistant message, then fires post-reply background tasks.
   */
  async streamReply(
    userId: string,
    sessionId: string,
    _userMessage: string,
  ) {
    const session = await kvGet<ChatSession>(
      kvKeys.chatSession(userId, sessionId),
    );
    if (!session) throw new NotFoundError("对话");

    const history = session.messages;
    const ctx = await buildAgentContext(
      userId,
      history.map((m) => ({ role: m.role, content: m.content })),
      { summary: session.summary },
    );

    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey === "sk-test-placeholder" || config.apiKey.length < 10) {
      throw new Error("NO_API_KEY");
    }

    const client = createAIClient(config);

    return streamText({
      model: client(config.model),
      system: ctx.systemPrompt,
      messages: ctx.messages,
      temperature: 0.7,
      maxRetries: 1,
      onFinish: async ({ text }) => {
        if (!text.trim()) return;
        await ChatService.addMessage(userId, sessionId, {
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });

        runPostReplyTasks(userId, sessionId, _userMessage, text, config).catch(
          (e) => console.error("[PostReplyTasks]", e),
        );
      },
    });
  },

  /**
   * Stream a bootstrap conversation for new users without a study profile.
   * Uses BOOTSTRAP_PROMPT to guide the user through profile setup.
   * The client detects JSON in the reply to auto-save the profile.
   */
  async streamBootstrap(
    userId: string,
    sessionId: string,
  ) {
    const history = await this.getHistory(userId, sessionId);

    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey === "sk-test-placeholder" || config.apiKey.length < 10) {
      throw new Error("NO_API_KEY");
    }

    const client = createAIClient(config);
    const messages = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    return streamText({
      model: client(config.model),
      system: BOOTSTRAP_PROMPT,
      messages,
      temperature: 0.7,
      maxRetries: 1,
      onFinish: async ({ text }) => {
        if (!text.trim()) return;
        await ChatService.addMessage(userId, sessionId, {
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });
      },
    });
  },
};

const COMPACTION_THRESHOLD = 40;  // trigger compaction after this many messages
const COMPACTION_KEEP_RECENT = 20; // keep this many recent messages after compaction

/**
 * Background tasks after each AI reply (all fire-and-forget):
 *   1. Extract memorable facts from the exchange into long-term memory
 *   2. Compact old messages into a summary if threshold exceeded
 *   3. Track 1 minute of study time in today's episode
 */
async function runPostReplyTasks(
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantReply: string,
  config: AIConfig,
): Promise<void> {
  await Promise.allSettled([
    extractMemory(userId, userMessage, assistantReply, config),
    maybeCompactSession(userId, sessionId, config),
    EpisodeService.trackStudyMinutes(userId, 1),
  ]);
}

/**
 * Ask the LLM to identify memorable facts from a user↔AI exchange.
 * Extracted entries are persisted via MemoryService for future context recall.
 */
async function extractMemory(
  userId: string,
  userMessage: string,
  assistantReply: string,
  config: AIConfig,
): Promise<void> {
  const client = createAIClient(config);
  const prompt = `分析以下对话片段，判断是否包含值得长期记住的信息。
如果有，输出 JSON 数组（每条一个对象），格式：
[{"category":"weakness|strength|preference|milestone|correction|insight","content":"简要描述","importance":"high|medium|low"}]
如果没有值得记忆的内容，输出空数组 []

## 用户消息
${userMessage}

## AI 回复
${assistantReply.slice(0, 500)}

请只输出 JSON 数组，不要其他文字。`;

  try {
    const result = await generateText({
      model: client(config.model),
      prompt,
      temperature: 0,
      maxOutputTokens: 300,
      maxRetries: 1,
    });

    const text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const entries = JSON.parse(jsonMatch[0]) as Array<{
      category: string;
      content: string;
      importance: string;
    }>;

    for (const entry of entries) {
      if (!entry.content || entry.content.length < 4) continue;
      await MemoryService.addMemory(userId, {
        category: entry.category as import("@/modules/agent").MemoryEntry["category"],
        content: entry.content,
        importance: (entry.importance || "medium") as "high" | "medium" | "low",
        source: "对话自动提取",
      });
    }
  } catch {
    // non-critical, silently fail
  }
}

/**
 * Compact a session when it exceeds COMPACTION_THRESHOLD messages.
 * Older messages are summarised by the LLM into a ≤200-char digest,
 * then replaced, keeping only the most recent COMPACTION_KEEP_RECENT messages.
 * The summary is appended to session.summary for context continuity.
 */
async function maybeCompactSession(
  userId: string,
  sessionId: string,
  config: AIConfig,
): Promise<void> {
  const session = await kvGet<ChatSession>(
    kvKeys.chatSession(userId, sessionId),
  );
  if (!session || session.messages.length < COMPACTION_THRESHOLD) return;

  const oldMessages = session.messages.slice(0, -COMPACTION_KEEP_RECENT);
  const oldText = oldMessages
    .map((m) => `${m.role === "user" ? "主人" : "AI"}：${m.content.slice(0, 200)}`)
    .join("\n");

  const client = createAIClient(config);

  try {
    const result = await generateText({
      model: client(config.model),
      prompt: `请将以下对话压缩为简洁的学习摘要（200字以内），保留：
1. 讨论了哪些医学知识点
2. 主人在哪些知识上有困惑或犯错
3. 做出的学习决策或约定
4. 主人的情绪状态

对话内容：
${oldText.slice(0, 3000)}

请只输出摘要文字，不要其他格式。`,
      temperature: 0,
      maxOutputTokens: 400,
      maxRetries: 1,
    });

    const freshSession = await kvGet<ChatSession>(
      kvKeys.chatSession(userId, sessionId),
    );
    if (!freshSession || freshSession.messages.length < COMPACTION_THRESHOLD) return;

    const newSummary = freshSession.summary
      ? `${freshSession.summary}\n\n---\n\n${result.text.trim()}`
      : result.text.trim();

    freshSession.summary = newSummary.slice(-2000);
    freshSession.messages = freshSession.messages.slice(-COMPACTION_KEEP_RECENT);

    await kvPut(kvKeys.chatSession(userId, sessionId), freshSession);
  } catch {
    // non-critical
  }
}
