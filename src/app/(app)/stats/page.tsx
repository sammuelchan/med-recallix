"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, PageContainer } from "@/shared/components/layout";
import { Flame, BookOpen, Brain, Clock, TrendingUp, Trophy, Plus, RotateCcw } from "lucide-react";
import type { StreakData } from "@/modules/review";
import type { DailyEpisode } from "@/modules/agent";

interface StatsData {
  totalKP: number;
  totalCards: number;
  mastered: number;
  learning: number;
  newCards: number;
  dueToday: number;
  streak: StreakData;
  todayEpisode: DailyEpisode | null;
  recentDays: { date: string; count: number; minutes: number }[];
}

function gradeLabel(count: number): string {
  if (count === 0) return "—";
  return String(count);
}

function WeekChart({ days }: { days: StatsData["recentDays"] }) {
  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">最近 7 天复习量</h3>
      <div className="flex items-end justify-between gap-1.5">
        {days.map((day) => {
          const h = Math.max((day.count / maxCount) * 80, 4);
          const d = new Date(day.date);
          const label = weekdays[d.getDay()];
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{gradeLabel(day.count)}</span>
              <div
                className="w-full rounded-t-md bg-primary/80 transition-all"
                style={{ height: `${h}px` }}
              />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
      });
  }, []);

  if (!data) {
    return (
      <>
        <Header title="学习统计" />
        <PageContainer>
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            加载中...
          </div>
        </PageContainer>
      </>
    );
  }

  const masteryPercent =
    data.totalCards > 0 ? Math.round((data.mastered / data.totalCards) * 100) : 0;

  const isEmpty = data.totalKP === 0 && data.totalCards === 0 && data.streak.totalReviews === 0;

  return (
    <>
      <Header title="学习统计" />
      <PageContainer>
        <div className="space-y-5">
          {/* Empty State */}
          {isEmpty && (
            <div className="rounded-2xl border border-dashed p-6 text-center space-y-4">
              <p className="text-4xl">📊</p>
              <div>
                <h3 className="font-semibold">还没有学习数据</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  添加知识点并完成复习后，这里将展示你的学习轨迹
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Link
                  href="/knowledge/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="size-4" /> 添加知识点
                </Link>
                <Link
                  href="/review"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  <RotateCcw className="size-4" /> 开始复习
                </Link>
              </div>
            </div>
          )}

          {/* Streak Banner */}
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:from-orange-950/30 dark:to-amber-950/30">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/50">
                <Flame className="size-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {data.streak.currentStreak}
                </p>
                <p className="text-xs text-muted-foreground">连续学习天数</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{data.streak.longestStreak}</p>
              <p className="text-xs text-muted-foreground">最长纪录</p>
            </div>
          </div>

          {/* Core Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <MiniCard
              icon={<BookOpen className="size-4 text-blue-500" />}
              value={data.totalKP}
              label="知识点"
            />
            <MiniCard
              icon={<Brain className="size-4 text-green-500" />}
              value={data.mastered}
              label="已掌握"
            />
            <MiniCard
              icon={<TrendingUp className="size-4 text-orange-500" />}
              value={data.dueToday}
              label="今日待复习"
            />
          </div>

          {/* Mastery Progress */}
          <div className="rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">掌握进度</h3>
              <span className="text-sm font-bold">{masteryPercent}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${masteryPercent}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>学习中 {data.learning}</span>
              <span>新卡片 {data.newCards}</span>
              <span>已掌握 {data.mastered}</span>
            </div>
          </div>

          {/* Week Chart */}
          <WeekChart days={data.recentDays} />

          {/* Today Summary */}
          {data.todayEpisode && (
            <div className="rounded-2xl border p-4">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">今日学习</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-sm">
                    学习 {data.todayEpisode.studyMinutes} 分钟
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateIcon />
                  <span className="text-sm">
                    复习 {data.todayEpisode.reviewedCount} 张卡片
                  </span>
                </div>
                {data.todayEpisode.quizScore !== undefined && (
                  <div className="flex items-center gap-2">
                    <Trophy className="size-4 text-yellow-500" />
                    <span className="text-sm">
                      测验得分 {data.todayEpisode.quizScore}
                    </span>
                  </div>
                )}
              </div>
              {data.todayEpisode.topics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.todayEpisode.topics.slice(0, 8).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Total Reviews */}
          <div className="rounded-2xl border p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {data.streak.totalReviews}
            </p>
            <p className="text-xs text-muted-foreground mt-1">累计复习次数</p>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function MiniCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border p-3">
      {icon}
      <span className="text-lg font-bold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function RotateIcon() {
  return (
    <svg className="size-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
