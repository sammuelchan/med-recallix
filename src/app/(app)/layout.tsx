import { BottomNav } from "@/shared/components/layout";
import { BubbleReminder } from "@/modules/daily-quiz/components/BubbleReminder";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      {children}
      <BubbleReminder />
      <BottomNav />
    </div>
  );
}
