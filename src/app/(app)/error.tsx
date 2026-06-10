"use client";

import { useEffect } from "react";
import { Button } from "@/shared/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">😵</p>
      <h2 className="text-xl font-semibold">页面出错了</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error.message || "发生了意外错误，请重试"}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/60 font-mono">
          错误ID: {error.digest}
        </p>
      )}
      <Button onClick={reset}>重试</Button>
    </div>
  );
}
