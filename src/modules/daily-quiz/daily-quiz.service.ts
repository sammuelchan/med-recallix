import { generateText } from "ai";
import { createAIClient, getAIConfig } from "@/shared/infrastructure/ai";
import { kvGet, kvBatchGet, kvPut, kvDelete, kvKeys } from "@/shared/infrastructure/kv";
import { generateId, toISODateString } from "@/shared/lib/utils";
import { ReviewService } from "@/modules/review";
import { KnowledgeService } from "@/modules/knowledge";
import { EpisodeService } from "@/modules/agent";
import { buildDailyQuizPrompt, buildDistractorPrompt } from "./daily-quiz.prompts";
import {
  calculateWeight,
  incrementError,
  incrementCorrect,
  createErrorWeightItem,
} from "./daily-quiz.weight";
import { DailyQuizAuditService } from "./daily-quiz.audit";
import type {
  DailyQuizSet,
  DailyQuizAnswerKey,
  DailyQuizProgress,
  DailyQuizResult,
  DailyQuizQuestion,
  ErrorWeightIndex,
  QuizCachePool,
  CachedQuestion,
  QuestionFeedback,
  QuestionFeedbackIndex,
} from "./daily-quiz.types";
import type { KnowledgePoint } from "@/modules/knowledge";
import type { KPIndexItem } from "@/modules/knowledge";

// ─── Generation Strategy Constants ──────────────────────────────────────────
// FIRST_BATCH: 首批同步生成的题目数，用户等待此批完成后即可开始答题
// TARGET_TOTAL: 总目标题数，首批完成后通过 COW 异步补全到此数量
// 算法: 用户答前 20 题时，后台 copy-on-write 补全到 50 题，写完后原子替换
const FIRST_BATCH = 20;
const TARGET_TOTAL = 50;
const MIN_KP_COUNT = 1;
const MAX_CACHE_SIZE = 500;
const ERROR_WEIGHT_MAX_SIZE = 100;

export const DailyQuizService = {
  /**
   * 获取今日 quiz 状态。并行读取 quiz/progress/result 三个 KV key。
   * 附带 fire-and-forget 清理过期数据（不阻塞响应）。
   */
  async getTodayQuiz(userId: string): Promise<{
    status: DailyQuizSet["status"] | null;
    quiz: DailyQuizSet | null;
    progress: DailyQuizProgress | null;
    result: DailyQuizResult | null;
  }> {
    const today = toISODateString();
    const [quiz, progress, result] = await Promise.all([
      kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today), "data", 15_000),
      kvGet<DailyQuizProgress>(kvKeys.dailyQuizProgress(userId, today)),
      kvGet<DailyQuizResult>(kvKeys.dailyQuizResult(userId, today), "data", 30_000),
    ]);

    this.cleanupExpiredRecords(userId).catch(() => {});
    DailyQuizAuditService.cleanupExpiredLogs(userId).catch(() => {});

    return {
      status: quiz?.status ?? null,
      quiz,
      progress,
      result,
    };
  },

  /**
   * 生成今日 quiz 首批题目。
   *
   * 算法流程:
   * 1. 幂等检查: 若今日已存在非 generating 状态的 quiz，直接返回
   * 2. 知识点选取: 按错题权重 > 薄弱区 > 新覆盖的优先级选取
   * 3. 首批生成: 同步生成 FIRST_BATCH(20) 题，写入 KV
   * 4. 异步续生: 若未达 TARGET_TOTAL，fire-and-forget 调用 continueGeneration
   *
   * 用户只需等待首批完成即可开始答题。
   */
  async generateDailyQuiz(userId: string): Promise<DailyQuizSet> {
    const today = toISODateString();
    const existing = await kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today));

    if (existing && existing.status !== "generating") {
      return existing;
    }

    const kpIndex = await KnowledgeService.getIndex(userId);
    if (kpIndex.length < MIN_KP_COUNT) {
      DailyQuizAuditService.append(userId, "kp_insufficient", `知识点数量 ${kpIndex.length}，需要至少 ${MIN_KP_COUNT} 个`).catch(() => {});
      throw new Error(`知识点不足 ${MIN_KP_COUNT} 个，请先添加更多知识点`);
    }

    const selection = await this.selectKnowledgePoints(userId, kpIndex);
    const allKpIds = [
      ...selection.errorReview,
      ...selection.weakArea,
      ...selection.newCoverage,
    ];

    DailyQuizAuditService.append(userId, "generate_start", `开始生成，知识点 ${kpIndex.length} 个，选取 ${allKpIds.length} 个（错题 ${selection.errorReview.length} / 薄弱 ${selection.weakArea.length} / 新覆盖 ${selection.newCoverage.length}），首批目标 ${FIRST_BATCH} 题`).catch(() => {});

    const startTime = Date.now();
    const questions = await this.generateBatch(userId, allKpIds, selection, FIRST_BATCH);
    const durationMs = Date.now() - startTime;

    DailyQuizAuditService.append(userId, "generate_batch_ok", `首批生成完成，得到 ${questions.length} 题`, { questionCount: questions.length, durationMs }).catch(() => {});

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

    await Promise.all([
      kvPut(kvKeys.dailyQuiz(userId, today), quizSet),
      this.syncAnswerKey(userId, today, questions),
    ]);

    if (quizSet.status === "ready") {
      DailyQuizAuditService.append(userId, "generate_complete", `生成完成，共 ${quizSet.readyCount} 题`, { questionCount: quizSet.readyCount }).catch(() => {});
    } else if (quizSet.status === "partial" && quizSet.readyCount >= FIRST_BATCH) {
      this.continueGeneration(userId).catch(() => {});
    }

    return quizSet;
  },

  /**
   * Copy-on-Write 续生题目。
   *
   * 核心算法:
   * 1. 读取当前 quizSet 快照（此时用户可能正在答题）
   * 2. 在内存中 COPY 出新的 questions 数组
   * 3. 对副本追加新生成的题目（不影响正在读取的原数据）
   * 4. 原子 WRITE: 一次性将完整新数组写回 KV
   *
   * 为什么用 COW:
   * - 用户答题时读取 questions[displayIndex]，此操作不加锁
   * - 续生过程可能耗时 10-30s，期间 questions 引用不能被修改
   * - COW 保证: 读者看到的要么是旧快照，要么是完整的新快照，不会看到中间态
   *
   * 降级策略: AI 生成失败时从缓存池取历史题目填充
   */
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

    // 节流防重: 若上一次续生在 60s 内启动，跳过本次（防止并发 poll 重复触发 AI）
    if (quizSet.continuingAt) {
      const elapsed = Date.now() - new Date(quizSet.continuingAt).getTime();
      if (elapsed < 60_000) {
        return quizSet;
      }
    }

    // 标记续生开始时间（KV 轻量锁，60s 自动过期兜底）
    quizSet.continuingAt = new Date().toISOString();
    await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);

    const kpIndex = await KnowledgeService.getIndex(userId);
    const selection = await this.selectKnowledgePoints(userId, kpIndex);
    const allKpIds = [
      ...selection.errorReview,
      ...selection.weakArea,
      ...selection.newCoverage,
    ];

    DailyQuizAuditService.append(userId, "continue_start", `继续生成，已有 ${quizSet.readyCount} 题，剩余 ${remaining} 题`).catch(() => {});

    // ─── COW: 复制当前题目数组，在副本上操作 ───────────────────
    const snapshot = [...quizSet.questions];

    try {
      const batchSize = Math.min(remaining, 20);
      const startTime = Date.now();
      const newQuestions = await this.generateBatch(
        userId,
        allKpIds,
        selection,
        batchSize,
      );
      const durationMs = Date.now() - startTime;

      // 追加到副本而非原数组
      snapshot.push(...newQuestions);

      DailyQuizAuditService.append(userId, "continue_ok", `续批生成 ${newQuestions.length} 题，累计 ${snapshot.length}/${TARGET_TOTAL}`, { questionCount: newQuestions.length, durationMs }).catch(() => {});
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      DailyQuizAuditService.append(userId, "continue_fail", `续批生成失败，尝试缓存降级`, { error: errorMsg }).catch(() => {});

      const fallback = await this.getFallbackQuestions(userId, remaining);
      if (fallback.length > 0) {
        snapshot.push(...fallback);
        DailyQuizAuditService.append(userId, "generate_fallback", `缓存降级成功，补充 ${fallback.length} 题`, { questionCount: fallback.length }).catch(() => {});
      } else {
        DailyQuizAuditService.append(userId, "generate_fallback", `缓存降级失败，缓存池为空`).catch(() => {});
      }
    }

    // ─── COW: 原子写入 — 用完整副本一次性替换 ────────────────────
    const finalQuestions = snapshot.slice(0, TARGET_TOTAL);
    quizSet.questions = finalQuestions;
    quizSet.readyCount = finalQuestions.length;
    quizSet.status = quizSet.readyCount >= TARGET_TOTAL ? "ready" : (quizSet.readyCount > 0 ? "partial" : quizSet.status);
    quizSet.continuingAt = undefined;

    await Promise.all([
      kvPut(kvKeys.dailyQuiz(userId, today), quizSet),
      this.syncAnswerKey(userId, today, finalQuestions),
    ]);

    if (quizSet.status === "ready") {
      DailyQuizAuditService.append(userId, "generate_complete", `生成完成，共 ${quizSet.readyCount} 题`, { questionCount: quizSet.readyCount }).catch(() => {});
    }

    return quizSet;
  },

  /**
   * 提交答案。使用轻量 AnswerKey 代替加载完整 QuizSet，大幅降低延迟。
   *
   * 优化前: kvGet(全量QuizSet ~50题) + kvGet(progress) → ~3-5s
   * 优化后: kvGet(AnswerKey ~2KB) + kvGet(progress) → ~1-2s
   *
   * 设计要点:
   * - currentIndex = 已答题数（answers map 的 size），不依赖前端传入
   * - 首次答题时 fire-and-forget 更新 quiz status（不阻塞响应）
   * - 错题权重更新是 fire-and-forget，不阻塞响应
   */
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
    // Answer key is append-only during a session; 60s cache is safe.
    // Progress was just written by the previous submit; 30s write-through covers it.
    const [answerKey, progress] = await Promise.all([
      kvGet<DailyQuizAnswerKey>(kvKeys.dailyQuizAnswerKey(userId, today), "data", 60_000),
      kvGet<DailyQuizProgress>(kvKeys.dailyQuizProgress(userId, today)),
    ]);

    if (!answerKey) throw new Error("今日练习尚未生成");

    const qKey = answerKey.keys[questionId];
    if (!qKey) throw new Error("题目不存在");

    const isCorrect = qKey.answer === userAnswer;
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

    const previousAnswer = currentProgress.answers[questionId];
    if (previousAnswer !== undefined) {
      const wasCorrect = qKey.answer === previousAnswer;
      if (wasCorrect) currentProgress.correctCount--;
    }

    currentProgress.answers[questionId] = userAnswer;
    if (isCorrect) currentProgress.correctCount++;
    currentProgress.currentIndex = Object.keys(currentProgress.answers).length;
    currentProgress.lastAnsweredAt = now;

    // Write progress immediately (critical path)
    await kvPut(kvKeys.dailyQuizProgress(userId, today), currentProgress);

    // Fire-and-forget: update quiz status to in_progress on first answer
    if (currentProgress.currentIndex === 1) {
      (async () => {
        try {
          const quizSet = await kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today));
          if (quizSet && (quizSet.status === "partial" || quizSet.status === "ready")) {
            quizSet.status = "in_progress";
            await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);
          }
        } catch {}
      })();
    }

    // Fire-and-forget: update error weight
    const questionStub: DailyQuizQuestion = {
      id: questionId,
      stem: "",
      options: [],
      answer: qKey.answer,
      explanation: qKey.explanation,
      sourceKpId: qKey.sourceKpId,
      sourceType: qKey.sourceType,
      generatedBy: qKey.generatedBy,
    };
    this.updateErrorWeight(userId, questionStub, isCorrect).catch(() => {});

    return {
      isCorrect,
      correctAnswer: qKey.answer,
      explanation: qKey.explanation,
      progress: {
        currentIndex: currentProgress.currentIndex,
        correctCount: currentProgress.correctCount,
        total: Object.keys(answerKey.keys).length,
      },
    };
  },

  /**
   * 换一套题: 清除当日 quiz 和 progress，重新走 generateDailyQuiz 流程。
   * 已完成的练习不允许重新生成（防止刷分）。
   */
  async regenerateQuiz(userId: string): Promise<DailyQuizSet> {
    const today = toISODateString();
    const existing = await kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today));

    if (existing?.status === "completed") {
      throw new Error("今日练习已完成，无法重新生成");
    }

    await Promise.all([
      kvDelete(kvKeys.dailyQuiz(userId, today)),
      kvDelete(kvKeys.dailyQuizAnswerKey(userId, today)),
      kvDelete(kvKeys.dailyQuizProgress(userId, today)),
    ]);

    DailyQuizAuditService.append(userId, "generate_start", "用户手动换题，重新生成").catch(() => {});

    return this.generateDailyQuiz(userId);
  },

  /**
   * 用户提交题目反馈（答案错误、选项无关等）。
   * 反馈存入 KV，在下次生成时作为上下文传给 AI 避免同类错误。
   */
  async submitFeedback(
    userId: string,
    feedback: {
      questionId: string;
      type: string;
      correctAnswer?: string;
      comment?: string;
    },
  ): Promise<void> {
    const feedbackIndex = await kvGet<QuestionFeedbackIndex>(kvKeys.quizFeedback(userId)) ?? {
      userId,
      updatedAt: new Date().toISOString(),
      feedbacks: [],
    };

    feedbackIndex.feedbacks.push({
      questionId: feedback.questionId,
      userId,
      date: toISODateString(),
      type: feedback.type as QuestionFeedback["type"],
      correctAnswer: feedback.correctAnswer,
      comment: feedback.comment,
      createdAt: new Date().toISOString(),
    });

    // Keep last 50 feedbacks (rolling window)
    if (feedbackIndex.feedbacks.length > 50) {
      feedbackIndex.feedbacks = feedbackIndex.feedbacks.slice(-50);
    }
    feedbackIndex.updatedAt = new Date().toISOString();

    await kvPut(kvKeys.quizFeedback(userId), feedbackIndex);
  },

  /**
   * 构建反馈上下文，嵌入 AI Prompt 中避免重复犯错。
   * 取最近 10 条反馈，生成简短的避错提示。
   */
  async buildFeedbackContext(userId: string): Promise<string | undefined> {
    const index = await kvGet<QuestionFeedbackIndex>(kvKeys.quizFeedback(userId));
    if (!index || index.feedbacks.length === 0) return undefined;

    const recent = index.feedbacks.slice(-10);
    const typeLabels: Record<string, string> = {
      wrong_answer: "答案错误",
      irrelevant_options: "选项与题干无关",
      unclear_stem: "题干表述不清",
      other: "其他问题",
    };

    const lines = recent.map((fb) => {
      let line = `- 问题类型: ${typeLabels[fb.type] ?? fb.type}`;
      if (fb.correctAnswer) line += `，用户认为正确答案应为: ${fb.correctAnswer}`;
      if (fb.comment) line += `，备注: ${fb.comment}`;
      return line;
    });

    return lines.join("\n");
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

  /**
   * 知识点选取算法。三层优先级:
   *
   * 1. errorReview (最多10): 错题权重表中未毕业、权重>0 的 KP，按权重降序
   * 2. weakArea (最多8): SM-2 中 efactor<2.0 且已复习≥1次的薄弱 KP
   * 3. newCoverage (最多10): 未被复习卡覆盖的新 KP，保证题目多样性
   *
   * 兜底: 若三层总和不足 min(8, kpIndex.length)，随机补充至阈值
   */
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
      .slice(0, 10)
      .map((kp) => kp.id);

    // Ensure sufficient KPs: when error/weak are sparse, expand from all KPs
    const totalSelected = errorKps.length + weakKps.length + newKps.length;
    const targetSelected = Math.min(8, kpIndex.length);
    if (totalSelected < targetSelected) {
      const allUsed = new Set([...errorKps, ...weakKps, ...newKps]);
      const shuffled = [...kpIndex]
        .filter((kp) => !allUsed.has(kp.id))
        .sort(() => Math.random() - 0.5);
      const needed = targetSelected - totalSelected;
      newKps.push(...shuffled.slice(0, needed).map((kp) => kp.id));
    }

    // Even with just 1 KP, ensure at least that KP is included
    if (errorKps.length + weakKps.length + newKps.length === 0 && kpIndex.length > 0) {
      newKps.push(kpIndex[0].id);
    }

    return {
      errorReview: errorKps,
      weakArea: weakKps,
      newCoverage: newKps,
    };
  },

  /**
   * 批量生成题目。两阶段管线:
   *
   * Phase 1 (零延迟): 从 KP 内置的 QA 问答对直接转为选择题
   * Phase 2 (AI 调用): 不足部分通过 LLM 生成，含严格校验
   *
   * 校验规则: stem/options/answer/explanation 必须完整，
   * answer 必须是 A-E 且对应 option 存在，options ≥ 4 个
   *
   * 降级链: QA 直接生成 → AI 生成 → 缓存池取历史题
   */
  async generateBatch(
    userId: string,
    kpIds: string[],
    selection: { errorReview: string[]; weakArea: string[]; newCoverage: string[] },
    batchSize: number,
  ): Promise<DailyQuizQuestion[]> {
    const kpKeys = [...new Set(kpIds)].map((id) =>
      kvKeys.knowledgePoint(userId, id),
    );
    const kps = await kvBatchGet<KnowledgePoint>(kpKeys);
    const validKps = kps.filter((kp): kp is KnowledgePoint => kp !== null);

    if (validKps.length === 0) {
      DailyQuizAuditService.append(userId, "generate_batch_fail", `知识点内容全部加载失败，${kpIds.length} 个 KP 均为空`).catch(() => {});
      return this.getFallbackQuestions(userId, batchSize);
    }

    const errorSet = new Set(selection.errorReview);
    const weakSet = new Set(selection.weakArea);

    // Phase 1: Collect QA pairs from KPs (question + correct answer are reliable)
    // QA occupies at most 2/3; AI at least 1/3
    const qaMaxRatio = validKps.length <= 3 ? 0.3 : validKps.length <= 6 ? 0.5 : 0.65;
    const qaLimit = Math.max(2, Math.floor(batchSize * qaMaxRatio));
    const rawQAs = this.collectQAPairs(validKps, qaLimit, errorSet, weakSet);

    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey.length < 10) {
      DailyQuizAuditService.append(userId, "ai_key_missing", `AI API Key 未配置，无法生成`).catch(() => {});
      return this.getFallbackQuestions(userId, batchSize);
    }

    const client = createAIClient(config);
    const feedbackContext = await this.buildFeedbackContext(userId);
    const aiStart = Date.now();

    // Phase 2: AI generates distractors for QA items + pure AI questions in parallel
    const aiNeeded = batchSize - rawQAs.length;
    const qaQuestions: DailyQuizQuestion[] = [];
    const aiQuestions: DailyQuizQuestion[] = [];

    try {
      const promises: Promise<void>[] = [];

      // 2a: Generate AI distractors for QA-sourced questions
      if (rawQAs.length > 0) {
        promises.push(
          (async () => {
            const distractorPrompt = buildDistractorPrompt(
              rawQAs.map((item) => ({
                question: item.qa.question,
                answer: item.qa.answer,
                kpTitle: item.kp.title,
              })),
            );
            try {
              const { text } = await generateText({
                model: client(config.model),
                prompt: distractorPrompt,
                temperature: 0.5,
              });
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as Array<{ distractors: string[] }>;
                for (let i = 0; i < rawQAs.length && i < parsed.length; i++) {
                  const item = rawQAs[i];
                  const correctText = item.qa.answer.trim().toLowerCase();
                  const seen = new Set<string>([correctText]);
                  const distractors: string[] = [];
                  for (const d of parsed[i]?.distractors ?? []) {
                    const trimmed = d?.trim();
                    if (!trimmed || trimmed.length === 0) continue;
                    const key = trimmed.toLowerCase();
                    if (seen.has(key)) continue;
                    seen.add(key);
                    distractors.push(trimmed);
                    if (distractors.length >= 3) break;
                  }
                  if (distractors.length < 3) continue;

                  const correctAnswer = item.qa.answer.trim();
                  const correctIdx = Math.floor(Math.random() * 4);
                  const allOptions = [...distractors];
                  allOptions.splice(correctIdx, 0, correctAnswer);
                  const relabeled = allOptions.map((t, idx) => ({
                    label: String.fromCharCode(65 + idx),
                    text: t,
                  }));

                  qaQuestions.push({
                    id: generateId(),
                    stem: item.qa.question,
                    options: relabeled,
                    answer: String.fromCharCode(65 + correctIdx),
                    explanation: `【答案分析】正确答案为${String.fromCharCode(65 + correctIdx)}（${correctAnswer}）。本题考查知识点「${item.kp.title}」。`,
                    sourceKpId: item.kp.id,
                    sourceType: item.sourceType,
                    generatedBy: "qa_pair" as const,
                  });
                }
              }
            } catch { /* distractor generation failed, skip QA items */ }
          })(),
        );
      }

      // 2b: Generate pure AI questions
      if (aiNeeded > 0) {
        promises.push(
          (async () => {
            const prompt = buildDailyQuizPrompt(
              validKps.map((kp) => ({ title: kp.title, content: kp.content })),
              aiNeeded,
              feedbackContext,
            );
            const { text } = await generateText({
              model: client(config.model),
              prompt,
              temperature: 0.7,
            });
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return;

            const raw = JSON.parse(jsonMatch[0]) as Array<{
              stem: string;
              options: Array<{ label: string; text: string }>;
              answer: string;
              explanation: string;
            }>;

            const validLabels = new Set(["A", "B", "C", "D", "E"]);
            for (let i = 0; i < raw.length; i++) {
              const q = raw[i];
              if (!q.stem || !q.options || !q.answer || !q.explanation) continue;
              if (!validLabels.has(q.answer)) continue;
              if (q.options.length < 4) continue;
              const optionLabels = new Set(q.options.map((o) => o.label));
              if (!optionLabels.has(q.answer)) continue;
              const optionTexts = q.options.map((o) => o.text?.trim()).filter(Boolean);
              if (optionTexts.length < 4) continue;
              if (optionTexts.some((t) => t.length < 2)) continue;
              const uniqueTexts = new Set(optionTexts);
              if (uniqueTexts.size < optionTexts.length) continue;
              if (q.stem.trim().length < 10) continue;

              const kp = validKps[i % validKps.length];
              let sourceType: DailyQuizQuestion["sourceType"] = "new_coverage";
              if (kp && errorSet.has(kp.id)) sourceType = "error_review";
              else if (kp && weakSet.has(kp.id)) sourceType = "weak_area";

              aiQuestions.push({
                id: generateId(),
                stem: q.stem,
                options: q.options,
                answer: q.answer,
                explanation: q.explanation,
                sourceKpId: kp?.id ?? "",
                sourceType,
                generatedBy: "ai",
              });
            }
          })(),
        );
      }

      await Promise.all(promises);
      const durationMs = Date.now() - aiStart;

      if (qaQuestions.length === 0 && aiQuestions.length === 0) {
        DailyQuizAuditService.append(userId, "generate_batch_fail", `AI 生成 0 题通过校验`, { durationMs }).catch(() => {});
        return this.getFallbackQuestions(userId, batchSize);
      }

      DailyQuizAuditService.append(userId, "generate_batch_ok", `生成完成：QA ${qaQuestions.length} 题 + AI ${aiQuestions.length} 题`, { questionCount: qaQuestions.length + aiQuestions.length, durationMs }).catch(() => {});

      // Shuffle all questions together
      const combined = [...qaQuestions, ...aiQuestions];
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
      return combined;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      DailyQuizAuditService.append(userId, "generate_batch_fail", `AI 调用异常`, { error: errorMsg }).catch(() => {});
      return this.getFallbackQuestions(userId, batchSize);
    }
  },

  /**
   * Collect QA pairs from knowledge points for AI distractor generation.
   * Returns raw QA items with metadata; does NOT build full questions
   * (distractors will be generated by AI for quality).
   */
  collectQAPairs(
    kps: KnowledgePoint[],
    maxCount: number,
    errorSet: Set<string>,
    weakSet: Set<string>,
  ): { kp: KnowledgePoint; qa: { question: string; answer: string }; sourceType: DailyQuizQuestion["sourceType"] }[] {
    const allQAs: { kp: KnowledgePoint; qa: { question: string; answer: string }; sourceType: DailyQuizQuestion["sourceType"] }[] = [];

    for (const kp of kps) {
      if (kp.qaItems && kp.qaItems.length > 0) {
        let sourceType: DailyQuizQuestion["sourceType"] = "new_coverage";
        if (errorSet.has(kp.id)) sourceType = "error_review";
        else if (weakSet.has(kp.id)) sourceType = "weak_area";

        for (const qa of kp.qaItems) {
          if (qa.question && qa.answer && qa.question.trim().length >= 5 && qa.answer.trim().length >= 2) {
            allQAs.push({ kp, qa, sourceType });
          }
        }
      }
    }

    if (allQAs.length === 0) return [];

    // Shuffle and limit
    for (let i = allQAs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQAs[i], allQAs[j]] = [allQAs[j], allQAs[i]];
    }
    return allQAs.slice(0, maxCount);
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
      generatedBy: "cache" as const,
    }));
  },

  /**
   * 错题权重更新。LRU 策略管理权重表（上限 ERROR_WEIGHT_MAX_SIZE=100）。
   *
   * 答错: 已有条目 → incrementError; 新条目 → 创建并加入（满则 LRU 淘汰）
   * 答对: 已有条目 → incrementCorrect（连续正确可毕业）
   *
   * 权重计算公式见 daily-quiz.weight.ts
   */
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

  /**
   * Build and persist a lightweight answer key from the full question list.
   * Merges with any existing key (for COW continuation batches).
   */
  async syncAnswerKey(
    userId: string,
    date: string,
    questions: DailyQuizQuestion[],
  ): Promise<void> {
    const existing = await kvGet<DailyQuizAnswerKey>(kvKeys.dailyQuizAnswerKey(userId, date));
    const keys: DailyQuizAnswerKey["keys"] = existing?.keys ?? {};

    for (const q of questions) {
      keys[q.id] = {
        answer: q.answer,
        explanation: q.explanation,
        sourceKpId: q.sourceKpId,
        sourceType: q.sourceType,
        generatedBy: q.generatedBy,
      };
    }

    await kvPut(kvKeys.dailyQuizAnswerKey(userId, date), {
      userId,
      date,
      keys,
    } satisfies DailyQuizAnswerKey);
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
        kvDelete(kvKeys.dailyQuizAnswerKey(userId, dateStr)).catch(() => {}),
        kvDelete(kvKeys.dailyQuizProgress(userId, dateStr)).catch(() => {}),
      );
    }

    await Promise.all(deletePromises);
  },
};
