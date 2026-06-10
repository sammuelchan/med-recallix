"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Header, PageContainer } from "@/shared/components/layout";
import { Flame, BookOpen, Brain, Clock, TrendingUp, Trophy, Plus, RotateCcw, FileText } from "lucide-react";
import { cachedFetch } from "@/shared/lib/fetch-cache";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { StreakData } from "@/modules/review";
import type { DailyEpisode } from "@/modules/agent";

interface CoreData {
  totalKP: number;
  totalCards: number;
  mastered: number;
  learning: number;
  newCards: number;
  dueToday: number;
  masteryPercent: number;
  streak: StreakData;
}

interface ChartData {
  todayEpisode: DailyEpisode | null;
  recentDays: { date: string; count: number; minutes: number }[];
}

interface QuizData {
  recentResults: { date: string; accuracy: number | null; completed: boolean }[];
  streak: number;
  todayCompleted: boolean;
  todayAccuracy: number | null;
}

function gradeLabel(count: number): string {
  if (count === 0) return "—";
  return String(count);
}

function WeekChart({ days }: { days: ChartData["recentDays"] }) {
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

function WeekChartSkeleton() {
  return (
    <div className="rounded-2xl border p-4">
      <Skeleton className="mb-3 h-4 w-28" />
      <div className="flex items-end justify-between gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <Skeleton className="h-3 w-4" />
            <Skeleton className="w-full" style={{ height: `${20 + Math.random() * 50}px` }} />
            <Skeleton className="h-3 w-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CoreStatsSkeleton() {
  return (
    <>
      {/* Streak Banner Skeleton */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:from-orange-950/30 dark:to-amber-950/30">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-5 w-8" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 rounded-xl border p-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-6 w-8" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* Mastery Skeleton */}
      <div className="rounded-2xl border p-4 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </>
  );
}

function QuizStatsSkeleton() {
  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <Skeleton className="h-4 w-16" />
      <div className="flex gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex items-end gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <Skeleton className="w-full" style={{ height: `${16 + Math.random() * 40}px` }} />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [core, setCore] = useState<CoreData | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [error, setError] = useState(false);

  const loadData = useCallback(() => {
    setError(false);
    cachedFetch<{ success: boolean; data?: CoreData }>("/api/stats?section=core", { ttl: 15_000 })
      .then((json) => { if (json.success && json.data) setCore(json.data); })
      .catch(() => setError(true));

    cachedFetch<{ success: boolean; data?: ChartData }>("/api/stats?section=chart", { ttl: 15_000 })
      .then((json) => { if (json.success && json.data) setChart(json.data); })
      .catch(() => {});

    cachedFetch<{ success: boolean; data?: QuizData }>("/api/stats?section=quiz", { ttl: 15_000 })
      .then((json) => { if (json.success && json.data) setQuiz(json.data); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (error && !core) {
    return (
      <>
        <Header title="学习统计" />
        <PageContainer>
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <p>加载失败</p>
            <button
              onClick={loadData}
              className="text-sm text-primary underline"
            >
              重试
            </button>
          </div>
        </PageContainer>
      </>
    );
  }

  const isEmpty = core && core.totalKP === 0 && core.totalCards === 0 && core.streak.totalReviews === 0;

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

          {/* Core Stats: Streak + Grid + Mastery */}
          {core ? (
            <>
              {/* Streak Banner */}
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:from-orange-950/30 dark:to-amber-950/30">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/50">
                    <Flame className="size-6 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {core.streak.currentStreak}
                    </p>
                    <p className="text-xs text-muted-foreground">连续学习天数</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{core.streak.longestStreak}</p>
                  <p className="text-xs text-muted-foreground">最长纪录</p>
                </div>
              </div>

              {/* Core Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <MiniCard
                  icon={<BookOpen className="size-4 text-blue-500" />}
                  value={core.totalKP}
                  label="知识点"
                  href="/knowledge"
                />
                <MiniCard
                  icon={<Brain className="size-4 text-green-500" />}
                  value={core.mastered}
                  label="已掌握"
                  href="/knowledge"
                />
                <MiniCard
                  icon={<TrendingUp className="size-4 text-orange-500" />}
                  value={core.dueToday}
                  label="今日待复习"
                  href="/review"
                />
              </div>

              {/* Mastery Progress */}
              <div className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">掌握进度</h3>
                  <span className="text-sm font-bold">{core.masteryPercent}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${core.masteryPercent}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>学习中 {core.learning}</span>
                  <span>新卡片 {core.newCards}</span>
                  <span>已掌握 {core.mastered}</span>
                </div>
              </div>
            </>
          ) : (
            <CoreStatsSkeleton />
          )}

          {/* Week Chart */}
          {chart ? <WeekChart days={chart.recentDays} /> : <WeekChartSkeleton />}

          {/* Today Summary */}
          {chart?.todayEpisode && (
            <div className="rounded-2xl border p-4">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">今日学习</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-sm">
                    学习 {chart.todayEpisode.studyMinutes} 分钟
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateIcon />
                  <span className="text-sm">
                    复习 {chart.todayEpisode.reviewedCount} 张卡片
                  </span>
                </div>
                {chart.todayEpisode.quizScore !== undefined && (
                  <div className="flex items-center gap-2">
                    <Trophy className="size-4 text-yellow-500" />
                    <span className="text-sm">
                      测验得分 {chart.todayEpisode.quizScore}
                    </span>
                  </div>
                )}
              </div>
              {chart.todayEpisode.topics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {chart.todayEpisode.topics.slice(0, 8).map((t) => (
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
          {core && (
            <div className="rounded-2xl border p-4 text-center">
              <p className="text-3xl font-bold text-primary">
                {core.streak.totalReviews}
              </p>
              <p className="text-xs text-muted-foreground mt-1">累计复习次数</p>
            </div>
          )}

          {/* Daily Quiz Stats */}
          {quiz ? (
            <div className="rounded-2xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">每日练习</h3>
                <Link
                  href="/daily-quiz/audit"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                >
                  <FileText className="size-3" />
                  生成日志
                </Link>
              </div>
              <div className="mb-3 flex items-center gap-4">
                {quiz.streak > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Flame className="size-4 text-orange-500" />
                    <span className="text-sm font-medium">连续 {quiz.streak} 天</span>
                  </div>
                )}
                {quiz.todayCompleted && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    今日已完成 {quiz.todayAccuracy}%
                  </span>
                )}
                {!quiz.todayCompleted && (
                  <Link href="/daily-quiz" className="text-xs text-blue-500 hover:underline">
                    去做题 →
                  </Link>
                )}
              </div>
              <div className="flex items-end gap-1">
                {quiz.recentResults.map((day) => (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="relative h-16 w-full">
                      <div
                        className={`absolute bottom-0 w-full rounded-sm transition-all ${
                          day.completed ? "bg-blue-400" : "bg-gray-200"
                        }`}
                        style={{ height: day.accuracy != null ? `${day.accuracy}%` : "8%" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {day.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <QuizStatsSkeleton />
          )}
        </div>
      </PageContainer>
    </>
  );
}

function MiniCard({
  icon,
  value,
  label,
  href,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  href?: string;
}) {
  const content = (
    <div className="flex flex-col items-center gap-1 rounded-xl border p-3 transition-colors hover:bg-muted/50">
      {icon}
      <span className="text-lg font-bold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function RotateIcon() {
  return (
    <svg className="size-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
