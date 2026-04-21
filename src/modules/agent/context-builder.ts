/**
 * Agent Context Builder — assembles the LLM system prompt from multiple layers
 *
 * The system prompt is constructed by merging these building blocks:
 *   1. AGENT_SOUL      — persona, tone, responsibilities
 *   2. AGENT_RULES     — behavioral constraints
 *   3. User Profile    — exam target, strong/weak subjects, study preferences
 *   4. Long-term Memory — keyword-recalled entries from past interactions
 *   5. Daily Episode   — today's study stats (minutes, reviews, quiz score)
 *   6. Early Summary   — compacted summary from older messages in the session
 *
 * The chat history window is capped at the most recent 20 messages to stay
 * within token limits while preserving conversational coherence.
 */

import { AGENT_RULES, AGENT_SOUL } from "./soul";
import { ProfileService } from "./profile.service";
import { MemoryService } from "./memory.service";
import { EpisodeService } from "./episode.service";
import type { AgentContext } from "./agent.types";

/** Extract Chinese words and English tokens from text for memory keyword recall. */
function extractKeywords(text: string): string[] {
  const raw =
    text.match(/[\u4e00-\u9fff]{1,8}|[a-zA-Z][a-zA-Z0-9-]{1,24}/g) ?? [];
  return [...new Set(raw.map((s) => s.toLowerCase()))].slice(0, 24);
}

function formatProfileBlock(profile: Awaited<ReturnType<typeof ProfileService.getProfile>>): string {
  if (!profile) return "";
  const lines = [
    "## 主人档案",
    `- 昵称：${profile.nickname}`,
    `- 考试目标：${profile.examTarget}`,
    profile.examDate ? `- 考试日期：${profile.examDate}` : null,
    profile.preferredStudyTime
      ? `- 偏好学习时段：${profile.preferredStudyTime}`
      : null,
    `- 每日目标（分钟）：${profile.dailyGoal}`,
    `- 难度偏好：${profile.difficultyPreference}`,
    `- 较强科目：${(profile.strongSubjects ?? []).join("、") || "（未填）"}`,
    `- 薄弱科目：${(profile.weakSubjects ?? []).join("、") || "（未填）"}`,
    profile.learningStyle ? `- 学习风格：${profile.learningStyle}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatMemoriesBlock(
  entries: Awaited<ReturnType<typeof MemoryService.recallMemories>>,
): string {
  if (entries.length === 0) return "";
  const lines = [
    "## 相关长期记忆（关键词召回）",
    ...entries.map(
      (e) =>
        `- [${e.category}/${e.importance}] ${e.content.replace(/\n/g, " ")}`,
    ),
  ];
  return lines.join("\n");
}

function formatEpisodeBlock(
  ep: Awaited<ReturnType<typeof EpisodeService.getEpisode>>,
): string {
  if (!ep) return "";
  const lines = [
    "## 今日学习片段",
    `- 日期：${ep.date}`,
    `- 学习时长（分钟）：${ep.studyMinutes}`,
    `- 复习卡片数：${ep.reviewedCount}`,
    ep.quizScore !== undefined ? `- 测验得分：${ep.quizScore}` : null,
    `- 涉及主题：${ep.topics.join("、") || "（无）"}`,
    ep.mood ? `- 心情/状态：${ep.mood}` : null,
    ep.summary ? `- 摘要：${ep.summary}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

const RECENT_WINDOW = 20;

interface BuildOptions {
  summary?: string;
}

/** Build the full agent context (system prompt + trimmed message history). */
export async function buildAgentContext(
  userId: string,
  chatHistory: { role: string; content: string }[],
  options?: BuildOptions,
): Promise<AgentContext> {
  const profile = await ProfileService.getProfile(userId);
  const lastUser = [...chatHistory].reverse().find((m) => m.role === "user");
  const keywords = lastUser ? extractKeywords(lastUser.content) : [];
  const [memories, episode] = await Promise.all([
    MemoryService.recallMemories(userId, keywords),
    EpisodeService.getEpisode(userId),
  ]);

  const summaryBlock = options?.summary
    ? `## 早期对话摘要\n${options.summary}`
    : "";

  const parts = [
    AGENT_SOUL,
    "",
    AGENT_RULES,
    "",
    formatProfileBlock(profile),
    formatMemoriesBlock(memories),
    formatEpisodeBlock(episode),
    summaryBlock,
  ].filter((p) => p.length > 0);

  const systemPrompt = parts.join("\n\n");

  const filtered = chatHistory
    .filter(
      (m): m is { role: "system" | "user" | "assistant"; content: string } =>
        m.role === "system" || m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = filtered.length > RECENT_WINDOW
    ? filtered.slice(-RECENT_WINDOW)
    : filtered;

  return { systemPrompt, messages };
}
