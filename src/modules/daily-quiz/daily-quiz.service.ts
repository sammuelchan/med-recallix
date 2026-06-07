import { generateText } from "ai";
import { createAIClient, getAIConfig } from "@/shared/infrastructure/ai";
import { kvGet, kvBatchGet, kvPut, kvDelete, kvKeys } from "@/shared/infrastructure/kv";
import { generateId, toISODateString } from "@/shared/lib/utils";
import { ReviewService } from "@/modules/review";
import { KnowledgeService } from "@/modules/knowledge";
import { EpisodeService } from "@/modules/agent";
import { buildDailyQuizPrompt } from "./daily-quiz.prompts";
import {
  calculateWeight,
  incrementError,
  incrementCorrect,
  createErrorWeightItem,
} from "./daily-quiz.weight";
import type {
  DailyQuizSet,
  DailyQuizProgress,
  DailyQuizResult,
  DailyQuizQuestion,
  ErrorWeightIndex,
  QuizCachePool,
  CachedQuestion,
} from "./daily-quiz.types";
import type { KnowledgePoint } from "@/modules/knowledge";
import type { KPIndexItem } from "@/modules/knowledge";

const TARGET_TOTAL = 50;
const FIRST_BATCH = 10;
const MIN_KP_COUNT = 5;
const MAX_CACHE_SIZE = 500;
const ERROR_WEIGHT_MAX_SIZE = 100;

export const DailyQuizService = {
  async getTodayQuiz(userId: string): Promise<{
    status: DailyQuizSet["status"] | null;
    quiz: DailyQuizSet | null;
    progress: DailyQuizProgress | null;
    result: DailyQuizResult | null;
  }> {
    const today = toISODateString();
    const [quiz, progress, result] = await Promise.all([
      kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today)),
      kvGet<DailyQuizProgress>(kvKeys.dailyQuizProgress(userId, today)),
      kvGet<DailyQuizResult>(kvKeys.dailyQuizResult(userId, today)),
    ]);

    // Async cleanup of expired records (fire-and-forget, non-blocking)
    this.cleanupExpiredRecords(userId).catch(() => {});

    return {
      status: quiz?.status ?? null,
      quiz,
      progress,
      result,
    };
  },

  async generateDailyQuiz(userId: string): Promise<DailyQuizSet> {
    const today = toISODateString();
    const existing = await kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today));

    if (existing && existing.status !== "generating") {
      return existing;
    }

    const kpIndex = await KnowledgeService.getIndex(userId);
    if (kpIndex.length < MIN_KP_COUNT) {
      throw new Error(`知识点不足 ${MIN_KP_COUNT} 个，请先添加更多知识点`);
    }

    const selection = await this.selectKnowledgePoints(userId, kpIndex);
    const allKpIds = [
      ...selection.errorReview,
      ...selection.weakArea,
      ...selection.newCoverage,
    ];

    const questions = await this.generateBatch(userId, allKpIds, selection, FIRST_BATCH);

    const quizSet: DailyQuizSet = {
      id: generateId(),
      userId,
      date: today,
      status: questions.length >= TARGET_TOTAL ? "ready" : "partial",
      questions,
      totalCount: TARGET_TOTAL,
      readyCount: questions.length,
      generatedAt: new Date().toISOString(),
    };

    await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);
    return quizSet;
  },

  async continueGeneration(userId: string): Promise<DailyQuizSet> {
    const today = toISODateString();
    const quizSet = await kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today));

    if (!quizSet) {
      return this.generateDailyQuiz(userId);
    }

    if (quizSet.status === "ready" || quizSet.status === "completed") {
      return quizSet;
    }

    const remaining = TARGET_TOTAL - quizSet.readyCount;
    if (remaining <= 0) {
      quizSet.status = "ready";
      await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);
      return quizSet;
    }

    const kpIndex = await KnowledgeService.getIndex(userId);
    const selection = await this.selectKnowledgePoints(userId, kpIndex);
    const allKpIds = [
      ...selection.errorReview,
      ...selection.weakArea,
      ...selection.newCoverage,
    ];

    try {
      const batchSize = Math.min(remaining, 20);
      const newQuestions = await this.generateBatch(
        userId,
        allKpIds,
        selection,
        batchSize,
      );

      quizSet.questions.push(...newQuestions);
      quizSet.readyCount = quizSet.questions.length;
      quizSet.status = quizSet.readyCount >= TARGET_TOTAL ? "ready" : "partial";
    } catch {
      const fallback = await this.getFallbackQuestions(userId, remaining);
      if (fallback.length > 0) {
        quizSet.questions.push(...fallback);
        quizSet.readyCount = quizSet.questions.length;
      }
      quizSet.status = "ready";
    }

    await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);
    return quizSet;
  },

  async submitAnswer(
    userId: string,
    questionId: string,
    userAnswer: string,
  ): Promise<{
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
    progress: { currentIndex: number; correctCount: number; total: number };
  }> {
    const today = toISODateString();
    const [quizSet, progress] = await Promise.all([
      kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today)),
      kvGet<DailyQuizProgress>(kvKeys.dailyQuizProgress(userId, today)),
    ]);

    if (!quizSet) throw new Error("今日练习尚未生成");

    const question = quizSet.questions.find((q) => q.id === questionId);
    if (!question) throw new Error("题目不存在");

    const isCorrect = question.answer === userAnswer;
    const now = new Date().toISOString();

    const currentProgress: DailyQuizProgress = progress ?? {
      userId,
      date: today,
      currentIndex: 0,
      answers: {},
      correctCount: 0,
      startedAt: now,
      lastAnsweredAt: now,
    };

    currentProgress.answers[questionId] = userAnswer;
    if (isCorrect) currentProgress.correctCount++;
    currentProgress.currentIndex = Object.keys(currentProgress.answers).length;
    currentProgress.lastAnsweredAt = now;

    // Only write quizSet status change once (first answer transitions to in_progress)
    const needsStatusUpdate = quizSet.status === "partial" || quizSet.status === "ready";
    const writes: Promise<void>[] = [
      kvPut(kvKeys.dailyQuizProgress(userId, today), currentProgress),
    ];
    if (needsStatusUpdate) {
      quizSet.status = "in_progress";
      writes.push(kvPut(kvKeys.dailyQuiz(userId, today), quizSet));
    }
    await Promise.all(writes);

    // Update error weight async (non-blocking for faster response)
    this.updateErrorWeight(userId, question, isCorrect).catch(() => {});

    return {
      isCorrect,
      correctAnswer: question.answer,
      explanation: question.explanation,
      progress: {
        currentIndex: currentProgress.currentIndex,
        correctCount: currentProgress.correctCount,
        total: quizSet.readyCount,
      },
    };
  },

  async completeQuiz(userId: string): Promise<DailyQuizResult> {
    const today = toISODateString();
    const [quizSet, progress] = await Promise.all([
      kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today)),
      kvGet<DailyQuizProgress>(kvKeys.dailyQuizProgress(userId, today)),
    ]);

    if (!quizSet || !progress) throw new Error("答题数据不完整");

    const duration = Math.round(
      (new Date(progress.lastAnsweredAt).getTime() -
        new Date(progress.startedAt).getTime()) /
        1000,
    );

    const errorKpIds = quizSet.questions
      .filter((q) => progress.answers[q.id] && progress.answers[q.id] !== q.answer)
      .map((q) => q.sourceKpId);

    const kpIndex = await KnowledgeService.getIndex(userId);
    const weakCategories = this.calculateWeakCategories(errorKpIds, kpIndex);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayResult = await kvGet<DailyQuizResult>(
      kvKeys.dailyQuizResult(userId, toISODateString(yesterday)),
    );

    const accuracy = Math.round(
      (progress.correctCount / quizSet.readyCount) * 100,
    );
    const streak = await this.calculateStreak(userId, today);

    const result: DailyQuizResult = {
      userId,
      date: today,
      totalQuestions: quizSet.readyCount,
      correctCount: progress.correctCount,
      accuracy,
      duration,
      weakCategories,
      errorKpIds: [...new Set(errorKpIds)],
      comparedToYesterday: yesterdayResult
        ? accuracy - yesterdayResult.accuracy
        : undefined,
      streak,
      completedAt: new Date().toISOString(),
    };

    quizSet.status = "completed";
    quizSet.completedAt = result.completedAt;

    await Promise.all([
      kvPut(kvKeys.dailyQuizResult(userId, today), result),
      kvPut(kvKeys.dailyQuiz(userId, today), quizSet),
    ]);

    try {
      await EpisodeService.trackQuizScore(userId, accuracy);
    } catch {
      // non-critical, don't fail the completion
    }

    await this.cacheQuestions(userId, quizSet.questions);

    return result;
  },

  // ─── Internal Methods ────────────────────────────────────────

  async selectKnowledgePoints(
    userId: string,
    kpIndex: KPIndexItem[],
  ): Promise<{
    errorReview: string[];
    weakArea: string[];
    newCoverage: string[];
  }> {
    const [weights, cards] = await Promise.all([
      this.getErrorWeights(userId),
      ReviewService.getCardIndex(userId),
    ]);

    const cardMap = new Map(cards.map((c) => [c.knowledgePointId, c]));

    const errorKps = weights.items
      .filter((w) => !w.graduated && w.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map((w) => w.kpId);

    const errorSet = new Set(errorKps);
    const weakKps = cards
      .filter(
        (c) => c.efactor < 2.0 && c.repetition >= 1 && !errorSet.has(c.knowledgePointId),
      )
      .sort((a, b) => a.efactor - b.efactor)
      .slice(0, 8)
      .map((c) => c.knowledgePointId);

    const usedSet = new Set([...errorKps, ...weakKps]);
    const coveredKpIds = new Set(cards.map((c) => c.knowledgePointId));
    const newKps = kpIndex
      .filter((kp) => !coveredKpIds.has(kp.id) || !usedSet.has(kp.id))
      .filter((kp) => !usedSet.has(kp.id))
      .slice(0, 8)
      .map((kp) => kp.id);

    // Handle insufficient KPs by redistributing
    if (errorKps.length === 0) {
      const extra = kpIndex
        .filter((kp) => !usedSet.has(kp.id) && !newKps.includes(kp.id))
        .slice(0, 5)
        .map((kp) => kp.id);
      weakKps.push(...extra.slice(0, 3));
      newKps.push(...extra.slice(3));
    }

    return {
      errorReview: errorKps,
      weakArea: weakKps,
      newCoverage: newKps,
    };
  },

  async generateBatch(
    userId: string,
    kpIds: string[],
    selection: { errorReview: string[]; weakArea: string[]; newCoverage: string[] },
    batchSize: number,
  ): Promise<DailyQuizQuestion[]> {
    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey.length < 10) {
      return this.getFallbackQuestions(userId, batchSize);
    }

    const kpKeys = [...new Set(kpIds)].map((id) =>
      kvKeys.knowledgePoint(userId, id),
    );
    const kps = await kvBatchGet<KnowledgePoint>(kpKeys);
    const validKps = kps.filter((kp): kp is KnowledgePoint => kp !== null);

    if (validKps.length === 0) {
      return this.getFallbackQuestions(userId, batchSize);
    }

    const prompt = buildDailyQuizPrompt(
      validKps.map((kp) => ({ title: kp.title, content: kp.content })),
      batchSize,
    );

    try {
      const client = createAIClient(config);
      const { text } = await generateText({
        model: client(config.model),
        prompt,
        temperature: 0.7,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return this.getFallbackQuestions(userId, batchSize);

      const raw = JSON.parse(jsonMatch[0]) as Array<{
        stem: string;
        options: Array<{ label: string; text: string }>;
        answer: string;
        explanation: string;
      }>;

      const errorSet = new Set(selection.errorReview);
      const weakSet = new Set(selection.weakArea);

      return raw.map((q, i) => {
        const kp = validKps[i % validKps.length];
        let sourceType: DailyQuizQuestion["sourceType"] = "new_coverage";
        if (kp && errorSet.has(kp.id)) sourceType = "error_review";
        else if (kp && weakSet.has(kp.id)) sourceType = "weak_area";

        return {
          id: generateId(),
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          sourceKpId: kp?.id ?? "",
          sourceType,
        };
      });
    } catch {
      return this.getFallbackQuestions(userId, batchSize);
    }
  },

  async getFallbackQuestions(
    userId: string,
    count: number,
  ): Promise<DailyQuizQuestion[]> {
    const cache = await kvGet<QuizCachePool>(kvKeys.quizCache(userId));
    if (!cache || cache.questions.length === 0) return [];

    const shuffled = [...cache.questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((q) => ({
      id: generateId(),
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      sourceKpId: q.sourceKpId,
      sourceType: "new_coverage" as const,
    }));
  },

  async updateErrorWeight(
    userId: string,
    question: DailyQuizQuestion,
    isCorrect: boolean,
  ): Promise<void> {
    const weights = await this.getErrorWeights(userId);
    const cards = await ReviewService.getCardIndex(userId);
    const card = cards.find((c) => c.knowledgePointId === question.sourceKpId);
    const efactor = card?.efactor;

    const existingIdx = weights.items.findIndex(
      (w) => w.kpId === question.sourceKpId,
    );

    if (!isCorrect) {
      if (existingIdx >= 0) {
        // Merge update: same KP, increment error count
        weights.items[existingIdx] = incrementError(weights.items[existingIdx], efactor);
      } else {
        // New error entry — apply LRU eviction if at capacity
        if (weights.items.length >= ERROR_WEIGHT_MAX_SIZE) {
          this.evictLeastRecentItem(weights);
        }
        const kpIndex = await KnowledgeService.getIndex(userId);
        const kp = kpIndex.find((k) => k.id === question.sourceKpId);
        const item = createErrorWeightItem(
          question.sourceKpId,
          kp?.title ?? question.stem.slice(0, 20),
          kp?.category ?? [],
        );
        item.weight = calculateWeight(item, efactor);
        weights.items.push(item);
      }
    } else if (existingIdx >= 0) {
      weights.items[existingIdx] = incrementCorrect(
        weights.items[existingIdx],
        efactor,
      );
    }

    weights.updatedAt = new Date().toISOString();
    await kvPut(kvKeys.errorWeight(userId), weights);
  },

  /**
   * LRU eviction: remove the least recently active + lowest weight item.
   * Priority for eviction (from most likely to be evicted):
   *   1. Graduated items (already mastered)
   *   2. Oldest lastErrorDate with lowest weight
   */
  evictLeastRecentItem(weights: ErrorWeightIndex): void {
    if (weights.items.length === 0) return;

    // First try to evict graduated items (they're already mastered)
    const graduatedIdx = weights.items.findIndex((w) => w.graduated);
    if (graduatedIdx >= 0) {
      weights.items.splice(graduatedIdx, 1);
      return;
    }

    // Otherwise evict by composite score: lower = more evictable
    // Score = weight × recency_factor (recent errors are less evictable)
    let evictIdx = 0;
    let lowestScore = Infinity;

    for (let i = 0; i < weights.items.length; i++) {
      const item = weights.items[i];
      const daysSince = Math.max(
        1,
        Math.round(
          (Date.now() - new Date(item.lastErrorDate).getTime()) / 86400000,
        ),
      );
      const recencyFactor = 1 / daysSince;
      const score = item.weight * recencyFactor;

      if (score < lowestScore) {
        lowestScore = score;
        evictIdx = i;
      }
    }

    weights.items.splice(evictIdx, 1);
  },

  async getErrorWeights(userId: string): Promise<ErrorWeightIndex> {
    const data = await kvGet<ErrorWeightIndex>(kvKeys.errorWeight(userId));
    return data ?? { userId, updatedAt: new Date().toISOString(), items: [] };
  },

  async calculateStreak(userId: string, today: string): Promise<number> {
    // Batch check in groups of 7 to avoid sequential KV reads
    let streak = 1;
    const BATCH_SIZE = 7;

    for (let batch = 0; batch < 52; batch++) {
      const dateKeys: string[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const dayOffset = batch * BATCH_SIZE + i + 1;
        const d = new Date(today);
        d.setDate(d.getDate() - dayOffset);
        dateKeys.push(kvKeys.dailyQuizResult(userId, toISODateString(d)));
      }

      const results = await kvBatchGet<DailyQuizResult>(dateKeys);
      let broken = false;
      for (const r of results) {
        if (r) {
          streak++;
        } else {
          broken = true;
          break;
        }
      }
      if (broken) break;
    }

    return streak;
  },

  calculateWeakCategories(
    errorKpIds: string[],
    kpIndex: KPIndexItem[],
  ): { category: string; errorCount: number }[] {
    const categoryCount = new Map<string, number>();

    for (const kpId of errorKpIds) {
      const kp = kpIndex.find((k) => k.id === kpId);
      const cat = kp?.category?.[0] ?? "未分类";
      categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
    }

    return Array.from(categoryCount.entries())
      .map(([category, errorCount]) => ({ category, errorCount }))
      .sort((a, b) => b.errorCount - a.errorCount);
  },

  async cacheQuestions(
    userId: string,
    questions: DailyQuizQuestion[],
  ): Promise<void> {
    const cache = (await kvGet<QuizCachePool>(kvKeys.quizCache(userId))) ?? {
      userId,
      updatedAt: new Date().toISOString(),
      questions: [],
    };

    const now = new Date().toISOString();
    const newCached: CachedQuestion[] = questions.map((q) => ({
      id: q.id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      sourceKpId: q.sourceKpId,
      cachedAt: now,
    }));

    cache.questions = [...newCached, ...cache.questions].slice(0, MAX_CACHE_SIZE);
    cache.updatedAt = now;

    await kvPut(kvKeys.quizCache(userId), cache);
  },

  /**
   * Clean up quiz/progress records older than 7 days to reduce KV storage.
   * ErrorWeightIndex is permanently maintained via submitAnswer(), so no
   * pre-cleanup extraction is needed — just delete the bulky data.
   *
   * Scans days 8–30 to cover users who haven't opened the app in weeks.
   * DailyQuizResult is kept (small, needed for stats/streak calculation).
   */
  async cleanupExpiredRecords(userId: string): Promise<void> {
    const today = new Date();
    const deletePromises: Promise<void>[] = [];

    for (let i = 8; i <= 30; i++) {
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - i);
      const dateStr = toISODateString(pastDate);

      deletePromises.push(
        kvDelete(kvKeys.dailyQuiz(userId, dateStr)).catch(() => {}),
        kvDelete(kvKeys.dailyQuizProgress(userId, dateStr)).catch(() => {}),
      );
    }

    await Promise.all(deletePromises);
  },
};
