/**
 * Exam Service — immersive Q&A quiz with AI-powered question generation and scoring
 *
 * Two responsibilities:
 *   1. generate() — collects user's KP Q&A pairs for the selected category,
 *      then asks AI to generate additional extension/trap questions
 *   2. evaluate() — sends the user's free-text answer to AI for similarity
 *      and completeness scoring against the reference answer
 */

import { generateText } from "ai";
import { createAIClient, getAIConfig } from "@/shared/infrastructure/ai";
import { KnowledgeService } from "@/modules/knowledge";
import { kvBatchGet, kvKeys } from "@/shared/infrastructure/kv";
import { generateId } from "@/shared/lib/utils";
import { buildExamQuestionsPrompt, buildEvaluationPrompt } from "./exam.prompts";
import type { ExamQuestion, ExamEvaluation } from "./exam.types";
import type { KnowledgePoint } from "@/modules/knowledge";

const MAX_KPS_FOR_PROMPT = 15;
const MAX_PROMPT_CHARS = 8000;

export const ExamService = {
  async generate(
    userId: string,
    category: string | null | undefined,
    count: number = 10,
  ): Promise<ExamQuestion[]> {
    const index = await KnowledgeService.list(userId, category ?? undefined);
    if (index.length === 0) {
      throw new Error("所选分类下没有知识点，请先添加知识点");
    }

    // Batch-fetch KPs (gracefully skip missing ones)
    const keys = index.map((item) => kvKeys.knowledgePoint(userId, item.id));
    const rawKps = await kvBatchGet<KnowledgePoint>(keys);
    const kps = rawKps.filter((kp): kp is KnowledgePoint => kp !== null);

    if (kps.length === 0) {
      throw new Error("所选分类下没有可用知识点");
    }

    const userQuestions: ExamQuestion[] = [];
    for (const kp of kps) {
      if (kp.qaItems && kp.qaItems.length > 0) {
        for (const qa of kp.qaItems) {
          userQuestions.push({
            id: generateId(),
            question: qa.question,
            referenceAnswer: qa.answer,
            source: "user",
            category: kp.category,
            knowledgePointId: kp.id,
          });
        }
      }
    }

    const aiCount = Math.max(count - userQuestions.length, 3);

    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey === "sk-test-placeholder" || config.apiKey.length < 10) {
      if (userQuestions.length === 0) {
        throw new Error("该分类下的知识点没有问答内容，请切换到问答模式录入内容，或前往「设置」配置 AI Key 自动生成题目");
      }
      return shuffle(userQuestions).slice(0, count);
    }

    try {
      const client = createAIClient(config);

      // Sample KPs to avoid exceeding token limits
      const sampledKps = sampleKPs(kps, MAX_KPS_FOR_PROMPT, MAX_PROMPT_CHARS);
      const prompt = buildExamQuestionsPrompt(
        sampledKps.map((kp) => ({
          title: kp.title,
          content: kp.content,
          category: kp.category,
          qaItems: kp.qaItems?.map((qa) => ({ question: qa.question, answer: qa.answer })),
        })),
        aiCount,
      );

      const { text } = await generateText({
        model: client(config.model),
        prompt,
        temperature: 0.7,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]) as Array<{
          question: string;
          referenceAnswer: string;
          type?: string;
        }>;

        const sampledCategories = sampledKps.map((kp) => kp.category);
        const aiQuestions: ExamQuestion[] = raw.map((q, i) => ({
          id: generateId(),
          question: q.question,
          referenceAnswer: q.referenceAnswer,
          source: "ai" as const,
          category: sampledCategories[i % sampledCategories.length] ?? [],
        }));

        const combined = [...userQuestions, ...aiQuestions];
        return shuffle(combined).slice(0, count);
      }
    } catch {
      // AI generation failed — fall through to user questions only
    }

    return shuffle(userQuestions).slice(0, count);
  },

  async evaluate(
    question: string,
    referenceAnswer: string,
    userAnswer: string,
  ): Promise<ExamEvaluation> {
    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey === "sk-test-placeholder" || config.apiKey.length < 10) {
      throw new Error("尚未配置 AI API Key，请前往「设置」页面配置后再试");
    }

    const client = createAIClient(config);
    const prompt = buildEvaluationPrompt(question, referenceAnswer, userAnswer);

    const { text } = await generateText({
      model: client(config.model),
      prompt,
      temperature: 0.3,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 评估返回格式异常，请重试");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("AI 评估返回格式异常，请重试");
    }

    const similarity = clamp(Number(parsed.similarity) || 0, 0, 100);
    const completeness = clamp(Number(parsed.completeness) || 0, 0, 100);

    return {
      similarity,
      completeness,
      overall: Math.round(similarity * 0.5 + completeness * 0.5),
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
      missingPoints: Array.isArray(parsed.missingPoints)
        ? parsed.missingPoints.filter((p): p is string => typeof p === "string")
        : [],
    };
  },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sample KPs to stay within prompt size limits */
function sampleKPs(kps: KnowledgePoint[], maxCount: number, maxChars: number): KnowledgePoint[] {
  const shuffled = shuffle(kps);
  const selected: KnowledgePoint[] = [];
  let totalChars = 0;

  for (const kp of shuffled) {
    if (selected.length >= maxCount) break;
    const kpChars = kp.title.length + kp.content.length +
      (kp.qaItems?.reduce((sum, qa) => sum + qa.question.length + qa.answer.length, 0) ?? 0);
    if (totalChars + kpChars > maxChars && selected.length > 0) break;
    selected.push(kp);
    totalChars += kpChars;
  }

  return selected;
}
