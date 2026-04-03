"use client";

import { MessageSquare, Trash2, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { ChatSessionIndex } from "../chat.types";
import dayjs from "dayjs";

interface SessionListProps {
  sessions: ChatSessionIndex[];
  activeId?: string;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onDelete: (sessionId: string) => void;
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SessionListProps) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <Button
        variant="outline"
        className="mb-2 w-full justify-start gap-2 rounded-xl"
        onClick={onNew}
      >
        <Plus className="size-4" />
        新建对话
      </Button>

      {sessions.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          暂无历史对话
        </p>
      )}

      {sessions.map((s) => (
        <div
          key={s.sessionId}
          className={cn(
            "group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
            activeId === s.sessionId
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted",
          )}
          onClick={() => onSelect(s.sessionId)}
        >
          <MessageSquare className="size-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground">
              {dayjs(s.lastMessageAt).format("MM/DD HH:mm")}
            </p>
          </div>
          <button
            className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(s.sessionId);
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
