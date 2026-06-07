"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Flame } from "lucide-react";
import { Header, PageContainer } from "@/shared/components/layout";
import type { DailyQuizResult } from "@/modules/daily-quiz";

export default function DailyQuizReportPage() {
  const router = useRouter();
  const [result, setResult] = useState<DailyQuizResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily-quiz")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data.result) {
          setResult(json.data.result);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <Header title="答题报告" />
        <PageContainer>
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        </PageContainer>
      </>
    );
  }

  if (!result) {
    return (
      <>
        <Header title="答题报告" />
        <PageContainer>
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <p className="text-sm text-gray-500">暂无报告数据</p>
            <Link href="/daily-quiz" className="text-sm text-blue-500 hover:underline">
              去做题
            </Link>
          </div>
        </PageContainer>
      </>
    );
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background/95 px-4 backdrop-blur">
        <button onClick={() => router.push("/dashboard")} className="text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="ml-3 text-lg font-semibold">答题报告</h1>
      </header>

      <PageContainer>
        <div className="space-y-6">
          {/* Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-center text-white">
            <p className="mb-2 text-lg font-medium">🎉 今日练习完成！</p>
            <div className="flex items-center justify-center gap-8">
              <div>
                <p className="text-3xl font-bold">{result.accuracy}%</p>
                <p className="text-xs opacity-80">正确率</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{formatDuration(result.duration)}</p>
                <p className="text-xs opacity-80">用时</p>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 text-center">
              <p className="text-lg font-semibold text-green-600">{result.correctCount}</p>
              <p className="text-xs text-gray-500">答对</p>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <p className="text-lg font-semibold text-red-500">
                {result.totalQuestions - result.correctCount}
              </p>
              <p className="text-xs text-gray-500">答错</p>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <p className="text-lg font-semibold text-blue-600">{result.totalQuestions}</p>
              <p className="text-xs text-gray-500">总题数</p>
            </div>
          </div>

          {/* Trend */}
          <div className="flex items-center gap-4 rounded-xl border p-4">
            {result.streak > 1 && (
              <div className="flex items-center gap-1.5 text-orange-500">
                <Flame className="h-5 w-5" />
                <span className="text-sm font-medium">连续 {result.streak} 天</span>
              </div>
            )}
            {result.comparedToYesterday != null && (
              <div className="flex items-center gap-1.5">
                {result.comparedToYesterday >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={`text-sm font-medium ${result.comparedToYesterday >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  比昨天 {result.comparedToYesterday >= 0 ? "+" : ""}
                  {result.comparedToYesterday}%
                </span>
              </div>
            )}
          </div>

          {/* Weak categories */}
          {result.weakCategories.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">薄弱科目</h3>
              <div className="space-y-2">
                {result.weakCategories.map((cat) => (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                  >
                    <span className="text-sm text-gray-700">{cat.category}</span>
                    <span className="text-sm font-medium text-red-500">
                      {cat.errorCount} 题错
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pb-4">
            <Link
              href="/dashboard"
              className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              返回首页
            </Link>
            <Link
              href="/stats"
              className="flex-1 rounded-xl bg-blue-500 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              查看统计
            </Link>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
