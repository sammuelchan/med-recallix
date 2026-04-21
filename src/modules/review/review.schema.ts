/** Zod schema for review grade submission (integer 0–5, SM-2 scale). */

import { z } from "zod";

export const ReviewGradeSchema = z.object({
  grade: z.number().int().min(0).max(5),
});

export type ReviewGradeInput = z.infer<typeof ReviewGradeSchema>;
