"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle, Loader2 } from "lucide-react";
import type { DailyQuizStatus } from "../daily-quiz.types";

interface DailyQuizState {
  status: DailyQuizStatus | null;
  readyCount?: number;
  totalCount?: number;
  currentIndex?: number;
  accuracy?: number;
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
          setState({ status: null, loading: false });
          return;
        }

        const { status, quiz, progress, result } = json.data;

        if (result) {
          setState({ status: "completed", accuracy: result.accuracy, loading: false });
          return;
        }

        if (status === "ready" || status === "partial" || status === "in_progress") {
          setState({
            status,
            readyCount: quiz?.readyCount,
            totalCount: quiz?.totalCount ?? 50,
            currentIndex: progress?.currentIndex,
            loading: false,
          });
          return;
        }

        // Not generated — trigger async generation
        if (!status && !generationTriggered.current) {
          generationTriggered.current = true;
          setState({ status: "generating", loading: false });
          fetch("/api/daily-quiz", { method: "POST" })
            .then((r) => r.json())
            .then((genJson) => {
              if (genJson.success) {
                const q = genJson.data.quiz;
                setState({
                  status: q.status,
                  readyCount: q.readyCount,
                  totalCount: q.totalCount,
                  loading: false,
                });
                if (q.status === "partial") startPolling();
              }
            })
            .catch(() => setState({ status: null, loading: false }));
        } else {
          setState({ status: null, loading: false });
        }
      } catch {
        setState({ status: null, loading: false });
      }
    }

    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (json.success && json.data.quiz) {
          const q = json.data.quiz;
          if (q.status === "ready") {
            setState((prev) => ({ ...prev, status: "ready", readyCount: q.readyCount }));
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {}
    }, 5000);
    setTimeout(() => { if (pollRef.current) clearInterval(pollRef.current); }, 120000);
  }

  if (state.loading) {
    return null; // Don't show card while checking
  }

  if (state.status === "generating") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">正在准备今日练习...</p>
          <p className="text-xs text-gray-500">AI 正在出题，稍后即可开始</p>
        </div>
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
    const total = state.readyCount ?? state.totalCount ?? 50;

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

  // status === null — not enough KP or not logged in, don't show card
  return null;
}
