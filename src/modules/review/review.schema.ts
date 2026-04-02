import { z } from "zod";

export const ReviewGradeSchema = z.object({
  grade: z.number().int().min(0).max(5),
});

export type ReviewGradeInput = z.infer<typeof ReviewGradeSchema>;
