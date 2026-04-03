"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatSessionIndex } from "./chat.types";

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("only available for coding agents") || lower.includes("access_terminated")) {
    return "⚠️ 当前模型不支持 Web 应用调用\n\n「kimi-for-coding」仅限 Coding Agent 使用。\n请前往「设置」将模型改为 moonshot-v1-auto，\n或使用其他 OpenAI 兼容 API（如 DeepSeek）。";
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("invalid") || lower.includes("expired")) {
    return "⚠️ AI API Key 无效或已过期\n\n请前往底部「设置」页面重新配置 API Key 后再试。";
  }
  if (lower.includes("insufficient balance") || lower.includes("suspended")) {
    return "⚠️ AI 账户余额不足\n\n请前往 API 平台充值后再试，\n或在「设置」中切换到其他 API（如 DeepSeek）。";
  }
  if (lower.includes("rate limit") || lower.includes("quota") || lower.includes("exceeded_current_quota")) {
    return "⚠️ AI 接口调用额度已用尽\n\n请前往 API 平台充值，或在「设置」中更换 API Key。";
  }
  if (lower.includes("timeout") || lower.includes("connect")) {
    return "⚠️ AI 服务连接超时\n\n请检查网络后重试。";
  }
  return `⚠️ AI 服务出错\n\n${raw}`;
}

function tryExtractProfileJson(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1].trim());
    if (obj && typeof obj === "object" && obj.examTarget) return obj;
  } catch { /* not valid */ }
  return null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<ChatSessionIndex[]>([]);
  const [isBootstrap, setIsBootstrap] = useState(false);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((json) => {
        if (json.success) {
          const has = json.data.hasProfile;
          setProfileReady(has);
          if (!has) setIsBootstrap(true);
        } else {
          setProfileReady(true);
        }
      })
      .catch(() => {
        setProfileReady(true);
      });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setSessions(json.data);
    } catch { /* silent */ }
  }, []);

  const loadHistory = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/chat/${sid}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setMessages(json.data);
        setSessionId(sid);
        setIsBootstrap(false);
      }
    } catch { /* silent */ }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setIsBootstrap(profileReady === false);
  }, [profileReady]);

  const deleteSession = useCallback(
    async (sid: string) => {
      await fetch(`/api/chat/${sid}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.sessionId !== sid));
      if (sid === sessionId) {
        startNewChat();
      }
    },
    [sessionId, startNewChat],
  );

  const saveProfileFromResponse = useCallback(async (text: string) => {
    const profile = tryExtractProfileJson(text);
    if (!profile) return;
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setIsBootstrap(false);
      setProfileReady(true);
    } catch { /* silent */ }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const placeholder: ChatMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, placeholder]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: sessionId ?? "new",
            bootstrap: isBootstrap,
          }),
          signal: controller.signal,
        });

        const newSid = res.headers.get("x-chat-session-id");
        if (newSid) setSessionId(newSid);

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "请求失败" }));
          const msg = err.code === "NO_API_KEY" || err.code === "INVALID_API_KEY"
            ? `⚠️ ${err.error}\n\n点击底部「设置」→ 填入 API Key → 保存`
            : friendlyError(err.error ?? "请求失败");
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: msg };
            return copy;
          });
          setIsStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let streamError = "";
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
              const jsonStr = trimmed.slice(6);
              try {
                const evt = JSON.parse(jsonStr);
                if (evt.type === "text-delta" && evt.delta) {
                  accumulated += evt.delta;
                } else if (evt.type === "error") {
                  streamError = friendlyError(evt.errorText || evt.message || JSON.stringify(evt));
                }
              } catch { /* skip non-JSON lines */ }
              continue;
            }

            if (trimmed.startsWith("0:")) {
              const textPart = trimmed.slice(2).trim();
              try { accumulated += JSON.parse(textPart); } catch { accumulated += textPart; }
            }
          }

          const display = streamError || accumulated;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...copy[copy.length - 1],
              content: display,
            };
            return copy;
          });
        }

        if (isBootstrap && accumulated) {
          saveProfileFromResponse(accumulated);
        }

        loadSessions();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...copy[copy.length - 1],
              content: "⚠️ 网络连接失败，请重试",
            };
            return copy;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, sessionId, isBootstrap, loadSessions, saveProfileFromResponse],
  );

  return {
    messages,
    isStreaming,
    isBootstrap,
    profileReady,
    sessionId,
    sessions,
    sendMessage,
    loadSessions,
    loadHistory,
    startNewChat,
    deleteSession,
  };
}
