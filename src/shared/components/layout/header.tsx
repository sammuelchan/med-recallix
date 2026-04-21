/**
 * Page Header — sticky top bar with title and optional action slot.
 *
 * Used on every app page to provide consistent navigation context.
 * The action slot can hold a button (e.g. "Add" on Knowledge page).
 */
"use client";

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <h1 className="text-lg font-semibold truncate">{title}</h1>
      {action && <div className="shrink-0 ml-2">{action}</div>}
    </header>
  );
}
