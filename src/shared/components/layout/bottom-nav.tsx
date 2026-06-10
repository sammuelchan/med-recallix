/**
 * Bottom Navigation Bar — mobile-first tab bar at viewport bottom.
 *
 * Five tabs: Dashboard, Knowledge, Review, Chat, Settings.
 * Active state is determined by matching the current pathname prefix.
 * Uses a solid background (non-floating, non-transparent) to avoid
 * occluding content. Takes real space in the flex layout.
 * Prefetches API data on touch/hover to reduce perceived latency.
 */
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  BookOpen,
  RotateCcw,
  MessageSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { prefetch } from "@/shared/lib/fetch-cache";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "首页", prefetchUrl: "/api/cards?status=summary" },
  { href: "/knowledge", icon: BookOpen, label: "知识点", prefetchUrl: "/api/knowledge" },
  { href: "/review", icon: RotateCcw, label: "复习", prefetchUrl: "/api/cards" },
  { href: "/chat", icon: MessageSquare, label: "对话", prefetchUrl: undefined },
  { href: "/settings", icon: Settings, label: "设置", prefetchUrl: "/api/config" },
] as const;

// 沉浸式路由 — 隐藏底部导航以最大化屏幕空间
const IMMERSIVE_PREFIXES = ["/daily-quiz", "/review", "/knowledge/exam", "/chat"];

export function BottomNav() {
  const pathname = usePathname();

  const hidden = IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p));
  if (hidden) return null;

  return (
    <nav className="shrink-0 border-t bg-background safe-bottom z-40">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-around px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label, prefetchUrl }) => {
          const isActive = pathname.startsWith(href);
          const shouldPrefetch = prefetchUrl && !isActive;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              onTouchStart={() => shouldPrefetch && prefetch(prefetchUrl)}
              onMouseEnter={() => shouldPrefetch && prefetch(prefetchUrl)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-xs transition-colors min-h-11",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground active:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
