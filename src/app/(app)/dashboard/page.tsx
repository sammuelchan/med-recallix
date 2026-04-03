"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { Flame, BarChart3 } from "lucide-react";
import { AIConfigBanner } from "@/shared/components/ai-config-banner";
import type { DueSummary, StreakData } from "@/modules/review";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DueSummary | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);

  useEffect(() => {
    fetch("/api/cards?status=summary")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setSummary(json.data.summary);
          setStreak(json.data.streak);
        }
      });
  }, []);

  const totalDue = summary ? summary.due + summary.overdue + summary.newToday : 0;

  return (
    <>
      <Header
        title="Med-Recallix"
        action={
          <Link href="/stats">
            <Button variant="ghost" size="icon" className="size-9">
              <BarChart3 className="size-5" />
            </Button>
          </Link>
        }
      />
      <PageContainer>
        <div className="space-y-6">
          <AIConfigBanner />

          {streak && streak.currentStreak > 0 && (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-orange-50 dark:bg-orange-950/30 p-4">
              <Flame className="size-6 text-orange-500" />
              <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                连续学习 {streak.currentStreak} 天
              </span>
            </div>
          )}

          <div className="rounded-2xl bg-primary/10 p-6 text-center">
            <p className="text-4xl mb-2">🧠</p>
            <h2 className="text-lg font-semibold">
              {totalDue > 0
                ? `今天有 ${totalDue} 张卡片等你复习`
                : "暂无待复习卡片"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {totalDue > 0
                ? "坚持每天复习，记忆效果翻倍"
                : "去添加知识点开始学习吧"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={summary?.due ?? 0}
              label="待复习"
              color="text-primary"
            />
            <StatCard
              value={summary?.overdue ?? 0}
              label="已逾期"
              color="text-orange-500"
            />
            <StatCard
              value={summary?.newToday ?? 0}
              label="新卡片"
              color="text-green-500"
            />
            <StatCard
              value={streak?.totalReviews ?? 0}
              label="总复习次数"
              color="text-foreground"
            />
          </div>

          {totalDue > 0 ? (
            <Link
              href="/review"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90"
            >
              开始复习 ({totalDue} 张)
            </Link>
          ) : (
            <Link
              href="/knowledge/new"
              className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground font-medium transition-colors hover:border-primary hover:text-primary"
            >
              + 添加知识点
            </Link>
          )}

          <Link
            href="/stats"
            className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50"
          >
            <BarChart3 className="size-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">学习统计</p>
              <p className="text-xs text-muted-foreground">
                查看学习进度、掌握情况和复习趋势
              </p>
            </div>
            <span className="text-muted-foreground">›</span>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
