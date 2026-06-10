/**
 * Page Header — sticky top bar with title, optional back button, and action slot.
 *
 * Used on every app page to provide consistent navigation context.
 * The action slot can hold a button (e.g. "Add" on Knowledge page).
 */
"use client";

import { ChevronLeft } from "lucide-react";

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
  onBack?: () => void;
}

export function Header({ title, action, onBack }: HeaderProps) {
  return (
    <header className="safe-top sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-1 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center size-8 -ml-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
            aria-label="返回"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold truncate">{title}</h1>
      </div>
      {action && <div className="shrink-0 ml-2">{action}</div>}
    </header>
  );
}
