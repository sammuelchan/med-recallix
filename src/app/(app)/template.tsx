/**
 * App Template — 每次路由切换时重新渲染
 *
 * 提供轻微的淡入动画，减少页面切换的突兀感。
 * template.tsx 与 layout.tsx 的区别：
 *   - layout.tsx 在路由切换间保持状态（不重新渲染）
 *   - template.tsx 每次导航都会重新创建实例
 *
 * 配合 CSS animation 实现每次进入时的淡入效果。
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col animate-in fade-in duration-150 fill-mode-both">
      {children}
    </div>
  );
}
