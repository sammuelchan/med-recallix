/**
 * Wrong Answer Service — persist, list, and manage wrong answers
 *
 * When a user scores below the threshold on an exam question,
 * the answer is saved to a per-user wrong-answer book for later review.
 * Duplicate questions (same question text) are merged, incrementing wrongCount.
 */

import { kvGet, kvPut, kvDelete, kvKeys } from "@/shared/infrastructure/kv";
import { generateId } from "@/shared/lib/utils";
import type { WrongAnswer, WrongAnswerIndexItem, ExamEvaluation } from "./exam.types";

const WRONG_THRESHOLD = 80;

export const WrongAnswerService = {
  async save(
    userId: string,
    input: {
      question: string;
      referenceAnswer: string;
      userAnswer: string;
      evaluation: ExamEvaluation;
      source: "user" | "ai";
      category: string[];
      knowledgePointId?: string;
    },
  ): Promise<WrongAnswer | null> {
    if (input.evaluation.overall >= WRONG_THRESHOLD) return null;

    const index = await this.getIndex(userId);
    const now = new Date().toISOString();

    const existing = index.find(
      (item) => item.question === input.question,
    );

    if (existing) {
      const record = await kvGet<WrongAnswer>(
        kvKeys.wrongAnswer(userId, existing.id),
      );

      const prevCount = record?.wrongCount ?? 0;
      const updated: WrongAnswer = {
        id: existing.id,
        question: input.question,
        referenceAnswer: input.referenceAnswer,
        userAnswer: input.userAnswer,
        evaluation: input.evaluation,
        source: input.source,
        category: input.category,
        knowledgePointId: input.knowledgePointId,
        createdAt: record?.createdAt ?? now,
        wrongCount: prevCount + 1,
      };

      const idxEntry = index.find((i) => i.id === existing.id)!;
      idxEntry.overallScore = input.evaluation.overall;
      idxEntry.wrongCount = updated.wrongCount;
      idxEntry.updatedAt = now;

      await Promise.all([
        kvPut(kvKeys.wrongAnswer(userId, existing.id), updated),
        kvPut(kvKeys.wrongAnswerIndex(userId), index),
      ]);

      return updated;
    }

    const id = generateId();
    const wrongAnswer: WrongAnswer = {
      id,
      question: input.question,
      referenceAnswer: input.referenceAnswer,
      userAnswer: input.userAnswer,
      evaluation: input.evaluation,
      source: input.source,
      category: input.category,
      knowledgePointId: input.knowledgePointId,
      createdAt: now,
      wrongCount: 1,
    };

    const indexItem: WrongAnswerIndexItem = {
      id,
      question: input.question,
      category: input.category,
      overallScore: input.evaluation.overall,
      wrongCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    index.push(indexItem);

    await Promise.all([
      kvPut(kvKeys.wrongAnswer(userId, id), wrongAnswer),
      kvPut(kvKeys.wrongAnswerIndex(userId), index),
    ]);

    return wrongAnswer;
  },

  async list(userId: string, category?: string): Promise<WrongAnswerIndexItem[]> {
    let index = await this.getIndex(userId);
    if (category) {
      index = index.filter((item) => item.category[0] === category);
    }
    return index.sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  },

  async get(userId: string, wrongId: string): Promise<WrongAnswer | null> {
    return kvGet<WrongAnswer>(kvKeys.wrongAnswer(userId, wrongId));
  },

  async remove(userId: string, wrongId: string): Promise<void> {
    const index = await this.getIndex(userId);
    const filtered = index.filter((item) => item.id !== wrongId);
    await Promise.all([
      kvDelete(kvKeys.wrongAnswer(userId, wrongId)),
      kvPut(kvKeys.wrongAnswerIndex(userId), filtered),
    ]);
  },

  async clear(userId: string): Promise<void> {
    const index = await this.getIndex(userId);
    await Promise.all([
      ...index.map((item) => kvDelete(kvKeys.wrongAnswer(userId, item.id))),
      kvPut(kvKeys.wrongAnswerIndex(userId), []),
    ]);
  },

  async getIndex(userId: string): Promise<WrongAnswerIndexItem[]> {
    return (await kvGet<WrongAnswerIndexItem[]>(kvKeys.wrongAnswerIndex(userId))) ?? [];
  },
};
