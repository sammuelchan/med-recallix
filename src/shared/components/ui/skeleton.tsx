/**
 * Skeleton 骨架屏原语组件
 *
 * 用于在数据加载期间占位，避免页面白屏/闪烁。
 * 所有页面的加载状态都应使用此组件构建骨架布局。
 *
 * 使用方式：
 *   <Skeleton className="h-5 w-3/4" />        // 文本行
 *   <Skeleton className="h-32 rounded-xl" />   // 卡片区域
 *   <Skeleton className="size-12 rounded-full" /> // 头像
 */
import { cn } from "@/shared/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
