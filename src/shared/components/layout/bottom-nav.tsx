/**
 * 底部导航栏 — 移动端主导航
 *
 * 五个 Tab：首页、知识点、复习、对话、设置。
 *
 * 关键设计：
 *   - 不使用 fixed/absolute，而是 flex sibling（shrink-0），不遮挡内容
 *   - safe-bottom 适配 iPhone 底部横条
 *   - 沉浸式路由（daily-quiz/review/exam/chat）返回 null 隐藏自身
 *   - onTouchStart 触发 prefetch，用户手指还在屏幕上时数据已在路上
 *   - aria-current="page" 标注当前活跃 tab，利于屏幕阅读器
 *   - min-h-11 (44px) 保证触控面积符合 iOS HIG 标准
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
