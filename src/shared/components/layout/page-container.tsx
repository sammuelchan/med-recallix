/**
 * Page Container — constrains page content to max-w-lg with padding.
 *
 * Content scrolls independently within this container.
 * The BottomNav below is a separate flex item that doesn't overlap.
 */

import { cn } from "@/shared/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main className={cn("flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-8", className)}>
      <div className="mx-auto max-w-lg">{children}</div>
    </main>
  );
}
