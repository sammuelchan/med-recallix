"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle, Loader2, AlertCircle, FileText } from "lucide-react";
import type { DailyQuizStatus } from "../daily-quiz.types";

interface DailyQuizState {
  status: DailyQuizStatus | null;
  readyCount?: number;
  totalCount?: number;
  currentIndex?: number;
  accuracy?: number;
  error?: string;
  loading: boolean;
}

export function DailyQuizCard() {
  const [state, setState] = useState<DailyQuizState>({ status: null, loading: true });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationTriggered = useRef(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (!json.success) {
          setState({ status: null, loading: false, error: json.error });
          return;
        }

        const { status, quiz, progress, result } = json.data;

        if (result) {
          setState({ status: "completed", accuracy: result.accuracy, loading: false });
          return;
        }

        if (status === "ready" || status === "in_progress") {
          setState({
            status,
            readyCount: quiz?.readyCount,
            totalCount: quiz?.totalCount ?? 20,
            currentIndex: progress?.currentIndex,
            loading: false,
          });
          return;
        }

        if (status === "partial") {
          setState({
            status: "generating",
            readyCount: quiz?.readyCount ?? 0,
            totalCount: quiz?.totalCount ?? 20,
            loading: false,
          });
          startPolling();
          return;
        }

        // Not generated — trigger async generation
        if (!status && !generationTriggered.current) {
          generationTriggered.current = true;
          setState({ status: "generating", readyCount: 0, totalCount: 20, loading: false });
          try {
            const genRes = await fetch("/api/daily-quiz", { method: "POST" });
            const genJson = await genRes.json();
            if (genJson.success) {
              const q = genJson.data.quiz;
              if (genJson.data.warning) {
                setState({ status: null, loading: false, error: genJson.data.warning });
              } else if (q.status === "ready") {
                setState({ status: "ready", readyCount: q.readyCount, totalCount: q.totalCount, loading: false });
              } else {
                setState({ status: "generating", readyCount: q.readyCount ?? 0, totalCount: q.totalCount ?? 20, loading: false });
                startPolling();
              }
            } else {
              setState({ status: null, loading: false, error: genJson.error ?? "生成失败" });
            }
          } catch {
            setState({ status: null, loading: false, error: "网络连接失败" });
          }
        } else {
          setState({ status: null, loading: false });
        }
      } catch {
        setState({ status: null, loading: false, error: "网络连接失败" });
      }
    }

    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (json.success && json.data.quiz) {
          const q = json.data.quiz;
          setState((prev) => ({
            ...prev,
            readyCount: q.readyCount,
            totalCount: q.totalCount,
          }));
          if (q.status === "ready") {
            setState((prev) => ({ ...prev, status: "ready", readyCount: q.readyCount }));
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {}

      if (attempts >= 24) {
        if (pollRef.current) clearInterval(pollRef.current);
        setState((prev) => {
          if (prev.status === "generating" && (prev.readyCount ?? 0) > 0) {
            return { ...prev, status: "ready" };
          }
          return { ...prev, status: null, error: "生成超时，请查看生成日志" };
        });
      }
    }, 5000);
  }

  if (state.loading) {
    return null;
  }

  // Error state — show what went wrong with link to audit log
  if (state.status === null && state.error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/30 p-4 dark:border-red-900/50 dark:bg-red-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/50">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">今日练习生成失败</p>
            <p className="text-xs text-red-600 dark:text-red-400 truncate">{state.error}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => {
              setState({ status: "generating", readyCount: 0, totalCount: 20, loading: false });
              generationTriggered.current = false;
              fetch("/api/daily-quiz", { method: "POST" })
                .then((r) => r.json())
                .then((json) => {
                  if (json.success) {
                    const q = json.data.quiz;
                    if (q.status === "ready") {
                      setState({ status: "ready", readyCount: q.readyCount, totalCount: q.totalCount, loading: false });
                    } else {
                      setState({ status: "generating", readyCount: q.readyCount ?? 0, totalCount: q.totalCount ?? 20, loading: false });
                    }
                  } else {
                    setState({ status: null, loading: false, error: json.error ?? "生成失败" });
                  }
                })
                .catch(() => setState({ status: null, loading: false, error: "网络连接失败" }));
            }}
            className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300"
          >
            重试
          </button>
          <Link
            href="/daily-quiz/audit"
            className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
          >
            <FileText className="size-3" />
            查看日志
          </Link>
        </div>
      </div>
    );
  }

  // Generating state — show progress bar
  if (state.status === "generating") {
    const ready = state.readyCount ?? 0;
    const total = state.totalCount ?? 20;
    const percent = total > 0 ? Math.round((ready / total) * 100) : 0;

    return (
      <div className="rounded-2xl border border-blue-100 bg-white p-4 dark:border-blue-900/50 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/50">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">正在准备今日练习...</p>
            <p className="text-xs text-gray-500">
              {ready > 0 ? `已生成 ${ready}/${total} 题` : "正在生成题目..."}
            </p>
          </div>
          <Link
            href="/daily-quiz/audit"
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="查看生成日志"
          >
            <FileText className="size-4" />
          </Link>
        </div>
        {total > 0 && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.max(percent, 5)}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (state.status === "completed") {
    return (
      <Link
        href="/daily-quiz/report"
        className="flex items-center gap-3 rounded-2xl border border-green-100 bg-green-50/50 p-4"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
          <CheckCircle className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">今日练习已完成 ✓</p>
          <p className="text-xs text-green-600">正确率 {state.accuracy}%</p>
        </div>
      </Link>
    );
  }

  if (state.status === "ready" || state.status === "partial" || state.status === "in_progress") {
    const current = state.currentIndex ?? 0;
    const total = state.readyCount ?? state.totalCount ?? 20;

    return (
      <Link
        href="/daily-quiz"
        className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 transition-colors hover:bg-blue-50/50"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
          <BookOpen className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">
            {current > 0 ? "继续今日练习" : "今日练习已就绪"}
          </p>
          <p className="text-xs text-gray-500">
            {current > 0 ? `已完成 ${current}/${total}` : `${total} 道题等你挑战`}
          </p>
        </div>
        <div className="text-xs font-medium text-blue-500">
          {current > 0 ? "继续 →" : "开始 →"}
        </div>
      </Link>
    );
  }

  return null;
}
