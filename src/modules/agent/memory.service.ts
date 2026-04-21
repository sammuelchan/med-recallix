/**
 * Memory Service — long-term memory management for the AI agent
 *
 * Stores facts about the user's learning journey (weaknesses, strengths,
 * preferences, milestones, corrections, insights) extracted from chat.
 *
 * Memory is capped at MAX_ENTRIES (100) per user. When exceeded, lower-
 * importance and older entries are trimmed (compacted). Recall is done
 * by keyword matching against entry content for context injection.
 */

import { kvGet, kvPut, kvKeys } from "@/shared/infrastructure/kv";
import { generateId, toISODateString } from "@/shared/lib/utils";
import type { LongTermMemory, MemoryEntry } from "./agent.types";

const MAX_ENTRIES = 100;

const importanceRank: Record<MemoryEntry["importance"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function trimEntries(entries: MemoryEntry[]): MemoryEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const sorted = [...entries].sort((a, b) => {
    const ir = importanceRank[a.importance] - importanceRank[b.importance];
    if (ir !== 0) return ir;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return sorted.slice(0, MAX_ENTRIES);
}

export const MemoryService = {
  async getMemory(userId: string): Promise<LongTermMemory> {
    const stored = await kvGet<LongTermMemory>(kvKeys.memory(userId));
    if (!stored) {
      return { entries: [], lastCompactedAt: toISODateString() };
    }
    if (stored.entries.length > MAX_ENTRIES) {
      const entries = trimEntries(stored.entries);
      const lastCompactedAt = toISODateString();
      await kvPut(kvKeys.memory(userId), { entries, lastCompactedAt });
      return { entries, lastCompactedAt };
    }
    return stored;
  },

  async addMemory(
    userId: string,
    entry: Omit<MemoryEntry, "id" | "createdAt">,
  ): Promise<MemoryEntry> {
    const mem = await this.getMemory(userId);
    const full: MemoryEntry = {
      ...entry,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    let entries = [...mem.entries, full];
    let lastCompactedAt = mem.lastCompactedAt;
    if (entries.length > MAX_ENTRIES) {
      entries = trimEntries(entries);
      lastCompactedAt = toISODateString();
    }
    await kvPut(kvKeys.memory(userId), {
      entries,
      lastCompactedAt,
    } satisfies LongTermMemory);
    return full;
  },

  /** Recall memories whose content matches any of the given keywords (case-insensitive). */
  async recallMemories(
    userId: string,
    keywords: string[],
  ): Promise<MemoryEntry[]> {
    if (keywords.length === 0) return [];
    const { entries } = await this.getMemory(userId);
    const lowered = keywords.map((k) => k.toLowerCase());
    return entries.filter((e) =>
      e.content && lowered.some((kw) => e.content.toLowerCase().includes(kw)),
    );
  },
};
