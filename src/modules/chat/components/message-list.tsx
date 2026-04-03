"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
  isBootstrap?: boolean;
}

export function MessageList({ messages, isStreaming, isBootstrap }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <span className="text-5xl">{isBootstrap ? "👋" : "🧠"}</span>
        <p className="text-center text-sm">
          {isBootstrap ? (
            <>
              欢迎来到瑞卡利斯！
              <br />
              发送任意消息，我来帮你建立学习档案
            </>
          ) : (
            <>
              你好，主人！我是瑞卡利斯
              <br />
              你的医考学习伙伴，有什么可以帮你的？
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          role={msg.role}
          content={msg.content}
          timestamp={msg.timestamp}
          isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
