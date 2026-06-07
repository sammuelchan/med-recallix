"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { X, SendHorizonal, Loader2, Merge } from "lucide-react";
import type { QAPair } from "../knowledge.types";

interface AIQASheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerge: (pairs: QAPair[]) => void;
  context: {
    title: string;
    category: string;
  };
}

interface SheetMessage {
  role: "user" | "assistant";
  content: string;
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

function buildSystemPrompt(title: string, category: string): string {
  return `你是一个医学知识助手。用户正在创建知识点，请帮助生成问答对。

当前知识点信息：
- 标题：${title || "（未填写）"}
- 分类：${category || "（未填写）"}

请严格按照以下格式输出问答对：
Q: 问题内容
A: 答案内容

Q: 问题内容
A: 答案内容

注意事项：
1. 每个问题和答案独立成行
2. 答案简明扼要，突出关键知识点
3. 问题要有针对性，方便记忆测试
4. 根据用户需求生成合适数量的问答对`;
}

export function AIQASheet({ open, onOpenChange, onMerge, context }: AIQASheetProps) {
  const [messages, setMessages] = useState<SheetMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedPairs, setDetectedPairs] = useState<ParsedQA[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setDetectedPairs([]);
      setIsStreaming(false);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant && !isStreaming) {
      const pairs = detectQAPairs(lastAssistant.content);
      setDetectedPairs(pairs);
    }
  }, [messages, isStreaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    const userMsg: SheetMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setDetectedPairs([]);

    const assistantMsg: SheetMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[系统指令]${buildSystemPrompt(context.title, context.category)}\n\n[用户请求]${text}`,
          sessionId: "new",
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: `⚠️ ${err.error ?? "AI服务暂时不可用"}` };
          return copy;
        });
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: DONE" || trimmed === "data: [DONE]") continue;

          if (trimmed.startsWith("data: ")) {
            try {
              const evt = JSON.parse(trimmed.slice(6));
              if (evt.type === "text-delta" && evt.delta) {
                accumulated += evt.delta;
              }
            } catch { /* skip */ }
            continue;
          }

          if (trimmed.startsWith("0:")) {
            const textPart = trimmed.slice(2).trim();
            try { accumulated += JSON.parse(textPart); } catch { accumulated += textPart; }
          }
        }

        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: accumulated };
          return copy;
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: "⚠️ 网络连接失败" };
          return copy;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, context]);

  const handleMerge = useCallback(() => {
    if (detectedPairs.length === 0) return;
    const qaPairs: QAPair[] = detectedPairs.map((pair, i) => ({
      id: `qa_ai_${Date.now()}_${i}`,
      question: pair.question,
      answer: pair.answer,
    }));
    onMerge(qaPairs);
    onOpenChange(false);
  }, [detectedPairs, onMerge, onOpenChange]);

  const handleClose = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    onOpenChange(false);
  }, [onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      <div className="relative z-10 flex flex-col bg-background rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">AI 补全问答</h3>
            {(context.title || context.category) && (
              <p className="text-xs text-muted-foreground truncate">
                {context.category && `${context.category} / `}{context.title || "新知识点"}
              </p>
            )}
          </div>
          <button onClick={handleClose} className="p-1 rounded-md hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground space-y-2">
              <p>告诉 AI 你想生成什么问答</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {["帮我生成5个核心问答", "围绕关键概念出题", "针对易混淆点出填空题"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.content}
                {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                  <span className="ml-1 inline-block animate-pulse">▍</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Merge button */}
        {detectedPairs.length > 0 && !isStreaming && (
          <div className="px-4 py-2 border-t shrink-0">
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleMerge}
            >
              <Merge className="size-3.5 mr-1.5" />
              合并 {detectedPairs.length} 对到表单
            </Button>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t shrink-0 safe-bottom">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入你的需求，如：生成5个问答对..."
              className="min-h-[40px] max-h-24 resize-none rounded-xl text-sm"
              rows={1}
              disabled={isStreaming}
            />
            <Button
              type="button"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
            >
              {isStreaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizonal className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
