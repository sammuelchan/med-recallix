import { BottomNav } from "@/shared/components/layout";

/**
 * App Shell 布局
 *
 * 整体结构：
 *   ┌────────────────────────────┐
 *   │ template.tsx (fade-in)     │  ← 每次路由切换重新渲染（过渡动画）
 *   │   ├── Header (sticky)      │  ← safe-top 适配刘海
 *   │   └── PageContainer (flex) │  ← 可滚动区域 + 可选下拉刷新
 *   ├────────────────────────────┤
 *   │ BottomNav (shrink-0)       │  ← 沉浸式路由自动隐藏
 *   └────────────────────────────┘
 *
 * 高度策略：h-dvh 使用动态视口高度，虚拟键盘弹出时布局自动收缩。
 * BottomNav 在 /daily-quiz、/review、/knowledge/exam、/chat 路由下隐藏。
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
