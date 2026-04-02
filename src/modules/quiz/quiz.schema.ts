import { z } from "zod";

export const GenerateQuizSchema = z.object({
  knowledgePointIds: z.array(z.string()).min(1, "至少选择一个知识点"),
  count: z.number().int().min(1).max(20).default(5),
});

export type GenerateQuizInput = z.infer<typeof GenerateQuizSchema>;
