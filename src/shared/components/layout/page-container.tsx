/**
 * Page Container — constrains page content to max-w-lg with padding.
 *
 * Adds bottom padding (pb-20) to avoid overlap with the fixed BottomNav.
 * Paired with Header on every app page for consistent layout.
 */

import { cn } from "@/shared/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main className={cn("flex-1 overflow-y-auto pb-20 px-4 py-4", className)}>
      <div className="mx-auto max-w-lg">{children}</div>
    </main>
  );
}
