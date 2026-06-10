/**
 * Page Container — constrains page content to max-w-lg with padding.
 *
 * Content scrolls independently within this container.
 * The BottomNav below is a separate flex item that doesn't overlap.
 *
 * 可选 onRefresh：传入后自动启用下拉刷新手势。
 */
"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/shared/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** 下拉刷新回调 — 传入即启用 pull-to-refresh */
  onRefresh?: () => Promise<void>;
}

const PTR_THRESHOLD = 60;
const PTR_MAX = 100;

export function PageContainer({ children, className, onRefresh }: PageContainerProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!onRefresh) return;
    const el = mainRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [onRefresh]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!onRefresh || !pulling.current || refreshing) return;
    const el = mainRef.current;
    if (!el || el.scrollTop > 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    const deltaY = e.touches[0].clientY - startY.current;
    if (deltaY < 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    const distance = Math.min(deltaY * 0.5, PTR_MAX);
    setPullDistance(distance);
    if (distance > 0) e.preventDefault();
  }, [onRefresh, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!onRefresh || !pulling.current) return;
    pulling.current = false;
    if (pullDistance >= PTR_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(PTR_THRESHOLD);
      try { await onRefresh(); } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [onRefresh, pullDistance, refreshing]);

  return (
    <main
      ref={mainRef}
      className={cn("flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 pt-4 pb-8", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 下拉刷新指示器 */}
      {onRefresh && pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-200 -mt-4 mb-4"
          style={{ height: `${pullDistance}px` }}
        >
          <div
            className={cn(
              "size-5 rounded-full border-2 border-primary border-t-transparent",
              refreshing && "animate-spin",
              pullDistance >= PTR_THRESHOLD ? "opacity-100" : "opacity-50",
            )}
            style={{ transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)` }}
          />
        </div>
      )}
      <div className="mx-auto max-w-lg">{children}</div>
    </main>
  );
}
