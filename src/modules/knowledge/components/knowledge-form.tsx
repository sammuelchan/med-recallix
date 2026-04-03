"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";

interface KnowledgeFormProps {
  initialData?: {
    title: string;
    content: string;
    category: string[];
    tags: string[];
  };
  onSubmit: (data: {
    title: string;
    content: string;
    category: string[];
    tags: string[];
    addToReview?: boolean;
  }) => Promise<void>;
  submitLabel?: string;
}

export function KnowledgeForm({
  initialData,
  onSubmit,
  submitLabel = "保存",
}: KnowledgeFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const title = (form.get("title") as string).trim();
    const content = (form.get("content") as string).trim();
    const categoryStr = (form.get("category") as string).trim();
    const tagsStr = (form.get("tags") as string).trim();

    if (!title || !content || !categoryStr) {
      setError("请填写标题、内容和分类");
      setLoading(false);
      return;
    }

    const category = categoryStr.split("/").map((s) => s.trim()).filter(Boolean);
    const tags = tagsStr ? tagsStr.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const addToReview = form.get("addToReview") === "on";

    try {
      await onSubmit({ title, content, category, tags, addToReview });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          name="title"
          placeholder="如：高血压分级诊断标准"
          defaultValue={initialData?.title}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">分类路径</Label>
        <Input
          id="category"
          name="category"
          placeholder="如：内科/心血管/高血压"
          defaultValue={initialData?.category.join("/")}
          required
        />
        <p className="text-xs text-muted-foreground">用 / 分隔层级</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">内容</Label>
        <Textarea
          id="content"
          name="content"
          placeholder="输入知识点内容，支持要点列表..."
          defaultValue={initialData?.content}
          rows={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tags">标签</Label>
        <Input
          id="tags"
          name="tags"
          placeholder="如：高频考点,重点"
          defaultValue={initialData?.tags.join(",")}
        />
        <p className="text-xs text-muted-foreground">用逗号分隔</p>
      </div>
      {!initialData && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="addToReview" defaultChecked className="rounded" />
          <span>立即加入复习卡片</span>
        </label>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "处理中..." : submitLabel}
      </Button>
    </form>
  );
}
