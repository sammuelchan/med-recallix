"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@/shared/lib/utils";
import { Copy, Check, BookPlus } from "lucide-react";
import { QAImportDialog } from "./qa-import-dialog";

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
  const [showImportDialog, setShowImportDialog] = useState(false);

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
                onClick={() => setShowImportDialog(true)}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <BookPlus className="size-3" />
                <span>导入知识点 ({qaPairs.length}对)</span>
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

      {hasQA && (
        <QAImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          qaPairs={qaPairs}
        />
      )}
    </div>
  );
}
