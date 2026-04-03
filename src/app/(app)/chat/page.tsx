"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Header } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { AIConfigBanner } from "@/shared/components/ai-config-banner";
import { MessageList } from "@/modules/chat/components/message-list";
import { ChatInput } from "@/modules/chat/components/chat-input";
import { SessionList } from "@/modules/chat/components/session-list";
import { useChatStream } from "@/modules/chat/use-chat";

export default function ChatPage() {
  const {
    messages,
    isStreaming,
    isBootstrap,
    sessionId,
    sessions,
    sendMessage,
    loadSessions,
    loadHistory,
    startNewChat,
    deleteSession,
  } = useChatStream();

  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = (sid: string) => {
    loadHistory(sid);
    setShowSidebar(false);
  };

  const handleNew = () => {
    startNewChat();
    setShowSidebar(false);
  };

  const currentTitle =
    sessions.find((s) => s.sessionId === sessionId)?.title ?? "新对话";

  return (
    <div className="flex h-[100dvh] flex-col">
      <Header
        title={currentTitle}
        action={
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? (
              <PanelLeftClose className="size-5" />
            ) : (
              <PanelLeftOpen className="size-5" />
            )}
          </Button>
        }
      />

      <div className="relative flex flex-1 overflow-hidden">
        {showSidebar && (
          <>
            <div
              className="absolute inset-0 z-10 bg-black/30 md:hidden"
              onClick={() => setShowSidebar(false)}
            />
            <aside className="absolute left-0 top-0 z-20 h-full w-72 overflow-y-auto border-r bg-background shadow-lg md:relative md:shadow-none">
              <SessionList
                sessions={sessions}
                activeId={sessionId}
                onSelect={handleSelectSession}
                onNew={handleNew}
                onDelete={deleteSession}
              />
            </aside>
          </>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-2">
            <AIConfigBanner />
          </div>
          <MessageList messages={messages} isStreaming={isStreaming} isBootstrap={isBootstrap} />
        </div>
      </div>

      <ChatInput onSend={sendMessage} disabled={isStreaming} />

      <div className="h-16" />
    </div>
  );
}
