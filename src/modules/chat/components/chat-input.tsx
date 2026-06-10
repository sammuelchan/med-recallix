"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 虚拟键盘弹出时确保输入框可见
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (containerRef.current && document.activeElement === textareaRef.current) {
        containerRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }, [value, disabled, onSend]);

  return (
    <div ref={containerRef} className="border-t bg-background p-3 safe-bottom">
      <div className="mx-auto flex max-w-lg items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          onFocus={() => {
            setTimeout(() => {
              containerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
            }, 300);
          }}
          placeholder="输入你的问题…"
          className="min-h-[44px] max-h-32 resize-none rounded-xl text-base"
          rows={1}
          disabled={disabled}
        />
        <Button
          size="icon"
          className="size-11 shrink-0 rounded-xl"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <SendHorizonal className="size-5" />
        </Button>
      </div>
    </div>
  );
}
