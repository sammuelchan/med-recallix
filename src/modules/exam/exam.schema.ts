import { z } from "zod";

export const GenerateExamSchema = z.object({
  category: z.string().nullable().optional(),
  count: z.number().int().min(3).max(30).default(10),
});

const EvaluationSchema = z.object({
  similarity: z.number().min(0).max(100),
  completeness: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  feedback: z.string(),
  missingPoints: z.array(z.string()),
});

export const EvaluateAnswerSchema = z.object({
  question: z.string().min(1).max(5000),
  referenceAnswer: z.string().min(1).max(5000),
  userAnswer: z.string().min(1).max(10000),
  source: z.enum(["user", "ai"]).optional(),
  category: z.array(z.string()).optional(),
  knowledgePointId: z.string().optional(),
});

export const SaveWrongAnswerSchema = z.object({
  question: z.string().min(1).max(5000),
  referenceAnswer: z.string().min(1).max(5000),
  userAnswer: z.string().min(1).max(10000),
  evaluation: EvaluationSchema,
  source: z.enum(["user", "ai"]),
  category: z.array(z.string()),
  knowledgePointId: z.string().optional(),
});

export type GenerateExamInput = z.infer<typeof GenerateExamSchema>;
export type EvaluateAnswerInput = z.infer<typeof EvaluateAnswerSchema>;
export type SaveWrongAnswerInput = z.infer<typeof SaveWrongAnswerSchema>;
