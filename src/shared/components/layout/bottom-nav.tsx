/**
 * Bottom Navigation Bar — mobile-first tab bar at viewport bottom.
 *
 * Five tabs: Dashboard, Knowledge, Review, Chat, Settings.
 * Active state is determined by matching the current pathname prefix.
 * Uses a solid background (non-floating, non-transparent) to avoid
 * occluding content. Takes real space in the flex layout.
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

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "首页" },
  { href: "/knowledge", icon: BookOpen, label: "知识点" },
  { href: "/review", icon: RotateCcw, label: "复习" },
  { href: "/chat", icon: MessageSquare, label: "对话" },
  { href: "/settings", icon: Settings, label: "设置" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 border-t bg-background safe-bottom z-40">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-around px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-xs transition-colors",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground",
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
