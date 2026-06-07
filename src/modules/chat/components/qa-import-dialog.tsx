"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface ParsedQA {
  question: string;
  answer: string;
}

interface QAImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qaPairs: ParsedQA[];
}

export function QAImportDialog({
  open,
  onOpenChange,
  qaPairs,
}: QAImportDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("对话导入");
  const [tags, setTags] = useState("AI生成");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (open) {
      setTitle(qaPairs[0]?.question.slice(0, 20) ?? "");
      setCategory("对话导入");
      setTags("AI生成");
      setStatus("idle");
    }
  }, [open, qaPairs]);

  const resetAndClose = useCallback(() => {
    setStatus("idle");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;
    setStatus("loading");

    const qaItems = qaPairs.map((pair, i) => ({
      id: `qa_${Date.now()}_${i}`,
      question: pair.question,
      answer: pair.answer,
    }));

    const categoryArr = category
      .split(/[,，/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tagsArr = tags
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          contentMode: "qa",
          content: "",
          qaItems,
          category: categoryArr.length > 0 ? categoryArr : ["对话导入"],
          tags: tagsArr,
        }),
      });

      if (res.ok) {
        setStatus("success");
        setTimeout(() => resetAndClose(), 1500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [title, category, tags, qaPairs, resetAndClose]);

  const handleDirectSave = useCallback(async () => {
    setStatus("loading");

    const autoTitle = qaPairs[0]?.question.slice(0, 20) ?? "Q&A";
    const qaItems = qaPairs.map((pair, i) => ({
      id: `qa_${Date.now()}_${i}`,
      question: pair.question,
      answer: pair.answer,
    }));

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: autoTitle,
          contentMode: "qa",
          content: "",
          qaItems,
          category: ["对话导入"],
          tags: ["AI生成"],
        }),
      });

      if (res.ok) {
        setStatus("success");
        setTimeout(() => resetAndClose(), 1500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [qaPairs, resetAndClose]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导入知识点</DialogTitle>
          <DialogDescription>
            识别到 {qaPairs.length} 对问答，可修改后保存或直接导入
          </DialogDescription>
        </DialogHeader>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Check className="size-8 text-green-500" />
            <p className="text-sm text-green-600 font-medium">导入成功!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-title">标题 (≤20字)</Label>
              <Input
                id="import-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 20))}
                placeholder="知识点标题"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground text-right">
                {title.length}/20
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-category">分类 (用 / 分隔层级)</Label>
              <Input
                id="import-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="如: 传染/乙脑"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-tags">标签 (逗号分隔)</Label>
              <Input
                id="import-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="如: AI生成, 重要"
              />
            </div>

            <div className="space-y-2">
              <Label>预览问答 ({qaPairs.length}对)</Label>
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-2">
                {qaPairs.slice(0, 5).map((pair, i) => (
                  <div key={i} className="text-xs space-y-0.5">
                    <p className="font-medium text-foreground">
                      Q{i + 1}: {pair.question.slice(0, 60)}
                      {pair.question.length > 60 ? "..." : ""}
                    </p>
                    <p className="text-muted-foreground">
                      A: {pair.answer.slice(0, 80)}
                      {pair.answer.length > 80 ? "..." : ""}
                    </p>
                  </div>
                ))}
                {qaPairs.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    ...还有 {qaPairs.length - 5} 对
                  </p>
                )}
              </div>
            </div>

            {status === "error" && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                <span>导入失败，请重试</span>
              </div>
            )}
          </div>
        )}

        {status !== "success" && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDirectSave}
              disabled={status === "loading"}
            >
              直接保存
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={status === "loading" || !title.trim()}
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                  保存中...
                </>
              ) : (
                "确认导入"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
