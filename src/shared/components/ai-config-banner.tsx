/**
 * AI Config Banner — prompts the user to configure an API key.
 *
 * Renders an amber warning banner that links to /settings when no AI API
 * key is detected. Automatically hidden while loading or after the key
 * is configured. Displayed on Dashboard and Chat pages.
 */
"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAIConfigStatus } from "@/shared/hooks/use-ai-config-status";

export function AIConfigBanner() {
  const { hasKey, loading } = useAIConfigStatus();

  if (loading || hasKey) return null;

  return (
    <Link
      href="/settings"
      className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/20"
    >
      <AlertTriangle className="size-5 shrink-0 text-amber-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">AI 功能未就绪</p>
        <p className="text-xs text-muted-foreground">
          请前往设置配置 API Key，以启用 AI 对话和出题功能
        </p>
      </div>
      <span className="shrink-0 text-xs text-amber-500 font-medium">
        去配置 →
      </span>
    </Link>
  );
}
