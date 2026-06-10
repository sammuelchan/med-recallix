import { BottomNav } from "@/shared/components/layout";

/**
 * App 全局布局。
 * 注: BubbleReminder 已移除 — 每日练习的初始化和入口统一由 Dashboard 的 DailyQuizCard 承担，
 * 避免在复习/知识点等无关页面触发 /api/daily-quiz 请求。
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      {children}
      <BottomNav />
    </div>
  );
}
