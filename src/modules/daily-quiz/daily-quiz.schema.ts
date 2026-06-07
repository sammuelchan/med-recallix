import { z } from "zod";

export const SubmitAnswerSchema = z.object({
  questionId: z.string().min(1, "题目ID不能为空"),
  answer: z.enum(["A", "B", "C", "D", "E"], {
    errorMap: () => ({ message: "答案必须为 A-E" }),
  }),
});

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerSchema>;
