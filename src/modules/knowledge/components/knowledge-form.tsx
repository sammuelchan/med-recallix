"use client";

import { useState, useCallback } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Plus, Trash2, FileText, HelpCircle } from "lucide-react";
import type { ContentMode, QAPair, BlankPosition } from "../knowledge.types";

interface KnowledgeFormProps {
  initialData?: {
    title: string;
    content: string;
    contentMode?: ContentMode;
    qaItems?: QAPair[];
    category: string[];
    tags: string[];
  };
  onSubmit: (data: {
    title: string;
    content: string;
    contentMode: ContentMode;
    qaItems?: QAPair[];
    category: string[];
    tags: string[];
    addToReview?: boolean;
  }) => Promise<void>;
  submitLabel?: string;
}

function generateQAId(): string {
  return `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectBlanks(answer: string): BlankPosition[] {
  const blanks: BlankPosition[] = [];
  const patterns = [
    /(?:第[一二三四五六七八九十\d]+[点条项]|[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)、])\s*([^，。；\n]+)/g,
    /(?:^|\n)\s*[-•]\s*([^，。；\n]+)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(answer)) !== null) {
      if (match[1] && match[1].length >= 2) {
        const text = match[1].trim();
        const start = match.index + match[0].indexOf(text);
        blanks.push({ start, end: start + text.length, text });
      }
    }
  }

  if (blanks.length === 0) {
    const sentences = answer.split(/[，。；、\n]+/).filter((s) => s.trim().length >= 2);
    for (const sentence of sentences.slice(0, 3)) {
      const trimmed = sentence.trim();
      const idx = answer.indexOf(trimmed);
      if (idx >= 0) {
        blanks.push({ start: idx, end: idx + trimmed.length, text: trimmed });
      }
    }
  }

  return blanks;
}

function parseQAText(text: string): QAPair[] {
  const pairs: QAPair[] = [];
  const lines = text.split("\n");
  let currentQ = "";
  let currentA = "";
  let inAnswer = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[QqＱ][：:]\s*/.test(trimmed)) {
      if (currentQ && currentA) {
        const blanks = detectBlanks(currentA.trim());
        pairs.push({
          id: generateQAId(),
          question: currentQ.trim(),
          answer: currentA.trim(),
          blanks,
        });
      }
      currentQ = trimmed.replace(/^[QqＱ][：:]\s*/, "");
      currentA = "";
      inAnswer = false;
    } else if (/^[AaＡ][：:]\s*/.test(trimmed)) {
      currentA = trimmed.replace(/^[AaＡ][：:]\s*/, "");
      inAnswer = true;
    } else if (inAnswer && trimmed) {
      currentA += "\n" + trimmed;
    } else if (!inAnswer && trimmed) {
      currentQ += " " + trimmed;
    }
  }

  if (currentQ && currentA) {
    const blanks = detectBlanks(currentA.trim());
    pairs.push({
      id: generateQAId(),
      question: currentQ.trim(),
      answer: currentA.trim(),
      blanks,
    });
  }

  return pairs;
}

export function KnowledgeForm({
  initialData,
  onSubmit,
  submitLabel = "保存",
}: KnowledgeFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contentMode, setContentMode] = useState<ContentMode>(
    initialData?.contentMode ?? "text",
  );
  const [qaItems, setQaItems] = useState<QAPair[]>(
    initialData?.qaItems ?? [{ id: generateQAId(), question: "", answer: "" }],
  );
  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState("");

  const addQAPair = useCallback(() => {
    setQaItems((prev) => [
      ...prev,
      { id: generateQAId(), question: "", answer: "" },
    ]);
  }, []);

  const removeQAPair = useCallback((idx: number) => {
    setQaItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateQAPair = useCallback(
    (idx: number, field: "question" | "answer", value: string) => {
      setQaItems((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], [field]: value };
        if (field === "answer" && value.trim()) {
          updated[idx].blanks = detectBlanks(value);
        }
        return updated;
      });
    },
    [],
  );

  const handleParseBatch = useCallback(() => {
    const parsed = parseQAText(batchText);
    if (parsed.length > 0) {
      setQaItems(parsed);
      setBatchMode(false);
      setBatchText("");
    }
  }, [batchText]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const title = (form.get("title") as string).trim();
    const categoryStr = (form.get("category") as string).trim();
    const tagsStr = (form.get("tags") as string).trim();

    if (!title || !categoryStr) {
      setError("请填写标题和分类");
      setLoading(false);
      return;
    }

    const category = categoryStr
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = tagsStr
      ? tagsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (contentMode === "text") {
      const content = (form.get("content") as string).trim();
      if (!content) {
        setError("请填写内容");
        setLoading(false);
        return;
      }
      try {
        await onSubmit({ title, content, contentMode, category, tags, addToReview: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      } finally {
        setLoading(false);
      }
    } else {
      const validItems = qaItems.filter(
        (item) => item.question.trim() && item.answer.trim(),
      );
      if (validItems.length === 0) {
        setError("请至少添加一个问答对");
        setLoading(false);
        return;
      }
      const itemsWithBlanks = validItems.map((item) => ({
        ...item,
        blanks: item.blanks ?? detectBlanks(item.answer),
      }));
      try {
        await onSubmit({
          title,
          content: "",
          contentMode,
          qaItems: itemsWithBlanks,
          category,
          tags,
          addToReview: true,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode toggle */}
      <div className="flex rounded-lg border p-1 gap-1">
        <button
          type="button"
          onClick={() => setContentMode("text")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            contentMode === "text"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <FileText className="size-3.5" />
          纯文本
        </button>
        <button
          type="button"
          onClick={() => setContentMode("qa")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            contentMode === "qa"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <HelpCircle className="size-3.5" />
          问答式
        </button>
      </div>

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

      {contentMode === "text" ? (
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
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>问答对</Label>
            <button
              type="button"
              onClick={() => setBatchMode(!batchMode)}
              className="text-xs text-primary hover:underline"
            >
              {batchMode ? "逐条输入" : "批量输入"}
            </button>
          </div>

          {batchMode ? (
            <div className="space-y-2">
              <Textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={`用 Q: 和 A: 标记问答对，例如：\nQ: 高血压一级的标准？\nA: 收缩压140-159mmHg\n舒张压90-99mmHg\n\nQ: 高血压二级的标准？\nA: 收缩压160-179mmHg`}
                rows={10}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleParseBatch}
                disabled={!batchText.trim()}
              >
                解析为问答对
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {qaItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      #{idx + 1}
                    </span>
                    {qaItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQAPair(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="问题"
                    value={item.question}
                    onChange={(e) => updateQAPair(idx, "question", e.target.value)}
                  />
                  <Textarea
                    placeholder="答案"
                    value={item.answer}
                    onChange={(e) => updateQAPair(idx, "answer", e.target.value)}
                    rows={3}
                  />
                  {item.blanks && item.blanks.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      已识别 {item.blanks.length} 个填空点
                    </p>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addQAPair}
                className="w-full"
              >
                <Plus className="size-3.5 mr-1" />
                添加问答对
              </Button>
            </div>
          )}
        </div>
      )}

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

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "处理中..." : submitLabel}
      </Button>
    </form>
  );
}
