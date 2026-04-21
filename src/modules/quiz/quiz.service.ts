import { generateText } from "ai";
import { createAIClient, getAIConfig } from "@/shared/infrastructure/ai";
import { KnowledgeService } from "@/modules/knowledge";
import { generateId } from "@/shared/lib/utils";
import { buildQuizPrompt } from "./quiz.prompts";
import type { QuizQuestion } from "./quiz.types";

export const QuizService = {
  async generate(
    userId: string,
    knowledgePointIds: string[],
    count: number = 5,
  ): Promise<QuizQuestion[]> {
    const kps = await Promise.all(
      knowledgePointIds.map((id) => KnowledgeService.get(userId, id)),
    );

    const config = await getAIConfig();
    if (!config.apiKey || config.apiKey === "sk-test-placeholder" || config.apiKey.length < 10) {
      throw new Error("尚未配置 AI API Key，请前往「设置」页面配置后再试");
    }

    // 创建 AI 客户端 并构建提示词
    const client = createAIClient(config);
    const prompt = buildQuizPrompt(
      kps.map((kp) => ({ title: kp.title, content: kp.content })),
      count,
    );

    const { text } = await generateText({
      model: client(config.model),
      prompt,
      temperature: 0.7,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI 返回格式异常，请重试");

    const raw = JSON.parse(jsonMatch[0]) as Array<{
      stem: string;
      options: Array<{ label: string; text: string }>;
      answer: string;
      explanation: string;
    }>;

    return raw.map((q) => ({
      id: generateId(),
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    }));
  },
};
