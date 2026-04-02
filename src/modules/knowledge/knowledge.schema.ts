import { z } from "zod";

export const CreateKPSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(100, "标题最多 100 字"),
  content: z.string().min(1, "内容不能为空"),
  category: z.array(z.string()).min(1, "至少选择一个分类"),
  tags: z.array(z.string()).default([]),
});

export const UpdateKPSchema = CreateKPSchema.partial();

export type CreateKPInput = z.infer<typeof CreateKPSchema>;
export type UpdateKPInput = z.infer<typeof UpdateKPSchema>;
