import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">🔍</p>
      <h2 className="text-xl font-semibold">页面不存在</h2>
      <p className="text-sm text-muted-foreground">
        你访问的页面可能已被移除或地址有误
      </p>
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        返回首页
      </Link>
    </div>
  );
}
