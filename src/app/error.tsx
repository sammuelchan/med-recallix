"use client";

import { Button } from "@/shared/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">😵</p>
      <h2 className="text-xl font-semibold">出错了</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error.message || "发生了意外错误，请重试"}
      </p>
      <Button onClick={reset}>重试</Button>
    </div>
  );
}
