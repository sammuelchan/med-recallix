/** Zod schemas for knowledge point creation and update (used in API routes). */

import { z } from "zod";

const BlankPositionSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string(),
});

const QAPairSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1, "问题不能为空"),
  answer: z.string().min(1, "答案不能为空"),
  blanks: z.array(BlankPositionSchema).optional(),
});

export const CreateKPSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(100, "标题最多 100 字"),
  contentMode: z.enum(["text", "qa"]).default("text"),
  content: z.string().default(""),
  qaItems: z.array(QAPairSchema).optional(),
  category: z.array(z.string()).min(1, "至少选择一个分类"),
  tags: z.array(z.string()).default([]),
}).refine(
  (data) => {
    if (data.contentMode === "text") return data.content.length > 0;
    if (data.contentMode === "qa") return data.qaItems && data.qaItems.length > 0;
    return true;
  },
  { message: "文本模式需要内容，问答模式需要至少一个问答对" },
);

export const UpdateKPSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(100, "标题最多 100 字").optional(),
  contentMode: z.enum(["text", "qa"]).optional(),
  content: z.string().optional(),
  qaItems: z.array(QAPairSchema).optional(),
  category: z.array(z.string()).min(1, "至少选择一个分类").optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateKPInput = z.infer<typeof CreateKPSchema>;
export type UpdateKPInput = z.infer<typeof UpdateKPSchema>;
