"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@/shared/lib/utils";
import { Copy, Check, BookPlus, Loader2 } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
}

interface ParsedQA {
  question: string;
  answer: string;
}

function detectQAPairs(text: string): ParsedQA[] {
  const pairs: ParsedQA[] = [];
  const lines = text.split("\n");
  let currentQ = "";
  let currentA = "";
  let inAnswer = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[QqＱ][：:]\s*/.test(trimmed) || /^\d+\.\s*[问問][：:]\s*/.test(trimmed)) {
      if (currentQ && currentA) {
        pairs.push({ question: currentQ.trim(), answer: currentA.trim() });
      }
      currentQ = trimmed.replace(/^[QqＱ][：:]\s*/, "").replace(/^\d+\.\s*[问問][：:]\s*/, "");
      currentA = "";
      inAnswer = false;
    } else if (/^[AaＡ][：:]\s*/.test(trimmed) || /^\s*[答][：:]\s*/.test(trimmed)) {
      currentA = trimmed.replace(/^[AaＡ][：:]\s*/, "").replace(/^\s*[答][：:]\s*/, "");
      inAnswer = true;
    } else if (inAnswer && trimmed) {
      currentA += "\n" + trimmed;
    } else if (!inAnswer && trimmed && currentQ) {
      currentQ += " " + trimmed;
    }
  }

  if (currentQ && currentA) {
    pairs.push({ question: currentQ.trim(), answer: currentA.trim() });
  }

  return pairs;
}

export function MessageBubble({
  role,
  content,
  isStreaming,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");

  const qaPairs = useMemo(() => {
    if (isUser || isStreaming) return [];
    return detectQAPairs(content);
  }, [content, isUser, isStreaming]);

  const hasQA = qaPairs.length > 0;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  const handleImportQA = useCallback(async () => {
    if (qaPairs.length === 0 || importing) return;
    setImporting(true);
    setImportStatus("idle");

    const title = qaPairs[0].question.slice(0, 30) + (qaPairs[0].question.length > 30 ? "..." : "");
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
          title,
          contentMode: "qa",
          content: "",
          qaItems,
          category: ["对话导入"],
          tags: ["AI生成"],
        }),
      });

      if (res.ok) {
        setImportStatus("success");
        setTimeout(() => setImportStatus("idle"), 3000);
      } else {
        setImportStatus("error");
        setTimeout(() => setImportStatus("idle"), 3000);
      }
    } catch {
      setImportStatus("error");
      setTimeout(() => setImportStatus("idle"), 3000);
    } finally {
      setImporting(false);
    }
  }, [qaPairs, importing]);

  return (
    <div
      className={cn(
        "flex w-full gap-2",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm">
          🧠
        </div>
      )}

      <div className="flex flex-col max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted rounded-bl-md",
          )}
        >
          {content}
          {isStreaming && (
            <span className="ml-1 inline-block animate-pulse">▍</span>
          )}
        </div>

        {!isUser && !isStreaming && content.length > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-green-500" />
                  <span className="text-green-500">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>复制</span>
                </>
              )}
            </button>

            {hasQA && (
              <button
                onClick={handleImportQA}
                disabled={importing}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors",
                  importStatus === "success"
                    ? "text-green-500"
                    : importStatus === "error"
                      ? "text-destructive"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                )}
              >
                {importing ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    <span>导入中...</span>
                  </>
                ) : importStatus === "success" ? (
                  <>
                    <Check className="size-3" />
                    <span>已导入 {qaPairs.length} 对</span>
                  </>
                ) : importStatus === "error" ? (
                  <span>导入失败</span>
                ) : (
                  <>
                    <BookPlus className="size-3" />
                    <span>导入知识点 ({qaPairs.length}对)</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
          👤
        </div>
      )}
    </div>
  );
}
