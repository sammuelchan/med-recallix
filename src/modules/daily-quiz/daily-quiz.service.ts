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
import { DailyQuizAuditService } from "./daily-quiz.audit";
import type {
  DailyQuizSet,
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
      kvGet<DailyQuizSet>(kvKeys.dailyQuiz(userId, today)),
      kvGet<DailyQuizProgress>(kvKeys.dailyQuizProgress(userId, today)),
      kvGet<DailyQuizResult>(kvKeys.dailyQuizResult(userId, today)),
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

    await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);

    if (quizSet.status === "ready") {
      DailyQuizAuditService.append(userId, "generate_complete", `生成完成，共 ${quizSet.readyCount} 题`, { questionCount: quizSet.readyCount }).catch(() => {});
    } else if (quizSet.status === "partial" && quizSet.readyCount >= FIRST_BATCH) {
      // Fire-and-forget: 后台异步补全剩余题目
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

    await kvPut(kvKeys.dailyQuiz(userId, today), quizSet);

    if (quizSet.status === "ready") {
      DailyQuizAuditService.append(userId, "generate_complete", `生成完成，共 ${quizSet.readyCount} 题`, { questionCount: quizSet.readyCount }).catch(() => {});
    }

    return quizSet;
  },

  /**
   * 提交答案。通过 questionId 定位题目，比对答案，更新 progress。
   *
   * 设计要点:
   * - currentIndex = 已答题数（answers map 的 size），不依赖前端传入
   * - 首次答题时将 quiz status 从 ready/partial → in_progress（仅一次写入）
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

    // Phase 1: Extract questions from KP's built-in QA pairs (instant, no AI needed)
    const qaQuestions = this.extractQAQuestions(validKps, batchSize, errorSet, weakSet);
    if (qaQuestions.length > 0) {
      DailyQuizAuditService.append(userId, "generate_batch_ok", `从知识点 QA 直接生成 ${qaQuestions.length} 题（无需 AI）`, { questionCount: qaQuestions.length, durationMs: 0 }).catch(() => {});
    }

    if (qaQuestions.length >= batchSize) {
      return qaQuestions.slice(0, batchSize);
    }

    // Phase 2: Supplement with AI-generated questions
    const aiNeeded = batchSize - qaQuestions.length;
    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey.length < 10) {
      DailyQuizAuditService.append(userId, "ai_key_missing", `AI API Key 未配置，已用 QA 生成 ${qaQuestions.length} 题`).catch(() => {});
      if (qaQuestions.length > 0) return qaQuestions;
      return this.getFallbackQuestions(userId, batchSize);
    }

    // Load user feedback to avoid repeating past mistakes
    const feedbackContext = await this.buildFeedbackContext(userId);

    const prompt = buildDailyQuizPrompt(
      validKps.map((kp) => ({ title: kp.title, content: kp.content })),
      aiNeeded,
      feedbackContext,
    );

    try {
      const client = createAIClient(config);
      const aiStart = Date.now();
      const { text } = await generateText({
        model: client(config.model),
        prompt,
        temperature: 0.7,
      });
      const aiDuration = Date.now() - aiStart;

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        DailyQuizAuditService.append(userId, "generate_batch_fail", `AI 返回内容无法解析为 JSON 数组`, { durationMs: aiDuration, error: `响应前100字: ${text.slice(0, 100)}` }).catch(() => {});
        if (qaQuestions.length > 0) return qaQuestions;
        return this.getFallbackQuestions(userId, batchSize);
      }

      const raw = JSON.parse(jsonMatch[0]) as Array<{
        stem: string;
        options: Array<{ label: string; text: string }>;
        answer: string;
        explanation: string;
      }>;

      const validLabels = new Set(["A", "B", "C", "D", "E"]);
      const aiQuestions: DailyQuizQuestion[] = [];

      for (let i = 0; i < raw.length; i++) {
        const q = raw[i];
        // 基础字段校验
        if (!q.stem || !q.options || !q.answer || !q.explanation) continue;
        if (!validLabels.has(q.answer)) continue;
        if (q.options.length < 4) continue;

        // 答案标签必须在选项中
        const optionLabels = new Set(q.options.map((o) => o.label));
        if (!optionLabels.has(q.answer)) continue;

        // 选项内容质量校验
        const optionTexts = q.options.map((o) => o.text?.trim()).filter(Boolean);
        if (optionTexts.length < 4) continue;
        // 选项不能太短（<2字）或存在重复
        if (optionTexts.some((t) => t.length < 2)) continue;
        const uniqueTexts = new Set(optionTexts);
        if (uniqueTexts.size < optionTexts.length) continue;

        // 题干不能太短（至少10字的完整句子）
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

      if (aiQuestions.length === 0 && qaQuestions.length === 0) {
        DailyQuizAuditService.append(userId, "generate_batch_fail", `AI 生成 ${raw.length} 题但全部未通过校验`, { durationMs: aiDuration }).catch(() => {});
        return this.getFallbackQuestions(userId, batchSize);
      }

      return [...qaQuestions, ...aiQuestions];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      DailyQuizAuditService.append(userId, "generate_batch_fail", `AI 调用异常`, { error: errorMsg }).catch(() => {});
      if (qaQuestions.length > 0) return qaQuestions;
      return this.getFallbackQuestions(userId, batchSize);
    }
  },

  /**
   * 从知识点内置 QA 对转为选择题格式。
   *
   * 核心策略:
   * - 正确答案来自 QA 对的 answer 字段
   * - 干扰项优先从**同一知识点**的其他 QA 答案中选取（同领域保证）
   * - 次优先从**同分类**的其他 KP 的 QA 答案中选取
   * - 最后才从所有 QA 答案中兜底（仍比随机 KP 标题好）
   * - 生成的 explanation 包含答案分析
   */
  extractQAQuestions(
    kps: KnowledgePoint[],
    maxCount: number,
    errorSet: Set<string>,
    weakSet: Set<string>,
  ): DailyQuizQuestion[] {
    const allQAs: { kp: KnowledgePoint; qa: { question: string; answer: string } }[] = [];

    for (const kp of kps) {
      if (kp.qaItems && kp.qaItems.length > 0) {
        for (const qa of kp.qaItems) {
          if (qa.question && qa.answer) {
            allQAs.push({ kp, qa });
          }
        }
      }
    }

    if (allQAs.length === 0) return [];

    const shuffled = allQAs.sort(() => Math.random() - 0.5).slice(0, maxCount);

    // Pre-build distractor pools by KP and by category for semantic relevance
    const answersByKpId = new Map<string, string[]>();
    const answersByCategory = new Map<string, string[]>();
    for (const item of allQAs) {
      const kpAnswers = answersByKpId.get(item.kp.id) ?? [];
      kpAnswers.push(item.qa.answer);
      answersByKpId.set(item.kp.id, kpAnswers);

      const cats = item.kp.category ?? [];
      for (const cat of cats) {
        const catAnswers = answersByCategory.get(cat) ?? [];
        catAnswers.push(item.qa.answer);
        answersByCategory.set(cat, catAnswers);
      }
    }

    return shuffled.map((item) => {
      const { kp, qa } = item;
      const distractors = this.pickDistractors(qa.answer, kp, answersByKpId, answersByCategory, allQAs);
      const options = [
        { label: "A", text: qa.answer },
        ...distractors.map((d, i) => ({ label: String.fromCharCode(66 + i), text: d })),
      ];

      const shuffledOptions = options.sort(() => Math.random() - 0.5);
      const relabeled = shuffledOptions.map((o, i) => ({
        label: String.fromCharCode(65 + i),
        text: o.text,
      }));
      const finalAnswer = relabeled.find((o) => o.text === qa.answer)?.label ?? "A";

      let sourceType: DailyQuizQuestion["sourceType"] = "new_coverage";
      if (errorSet.has(kp.id)) sourceType = "error_review";
      else if (weakSet.has(kp.id)) sourceType = "weak_area";

      return {
        id: generateId(),
        stem: qa.question,
        options: relabeled,
        answer: finalAnswer,
        explanation: `【答案分析】正确答案为${finalAnswer}（${qa.answer}）。本题考查知识点「${kp.title}」。`,
        sourceKpId: kp.id,
        sourceType,
        generatedBy: "qa_pair" as const,
      };
    });
  },

  /**
   * 选取 4 个干扰项。按语义相关度分层:
   *
   * 1. 同一知识点的其他 QA 答案（最佳，同一概念不同细节）
   * 2. 同分类知识点的 QA 答案（次优，同领域同维度）
   * 3. 所有 QA 答案（兜底，至少都是医学概念）
   *
   * 严禁使用 KP 标题或通用 filler（如"以上都不是"）作为干扰项
   */
  pickDistractors(
    correct: string,
    sourceKp: KnowledgePoint,
    answersByKpId: Map<string, string[]>,
    answersByCategory: Map<string, string[]>,
    allQAs: { kp: KnowledgePoint; qa: { question: string; answer: string } }[],
  ): string[] {
    const used = new Set<string>([correct]);
    const result: string[] = [];

    const addFromPool = (pool: string[]) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const item of shuffled) {
        if (result.length >= 4) return;
        if (!used.has(item) && item.length > 0) {
          used.add(item);
          result.push(item);
        }
      }
    };

    // Layer 1: same KP's other QA answers
    const sameKpAnswers = answersByKpId.get(sourceKp.id) ?? [];
    addFromPool(sameKpAnswers);

    // Layer 2: same category KP's QA answers
    if (result.length < 4) {
      const categories = sourceKp.category ?? [];
      for (const cat of categories) {
        if (result.length >= 4) break;
        const catAnswers = answersByCategory.get(cat) ?? [];
        addFromPool(catAnswers);
      }
    }

    // Layer 3: all QA answers (still medical concepts, better than random titles)
    if (result.length < 4) {
      const allAnswers = allQAs.map((item) => item.qa.answer);
      addFromPool(allAnswers);
    }

    // Layer 4 (absolute fallback): use content fragments from same KP
    if (result.length < 4 && sourceKp.content) {
      const sentences = sourceKp.content
        .split(/[。；\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4 && s.length <= 30 && s !== correct);
      addFromPool(sentences);
    }

    return result.slice(0, 4);
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
