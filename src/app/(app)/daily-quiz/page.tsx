"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Header, PageContainer } from "@/shared/components/layout";
import { cn } from "@/shared/lib/utils";
import type { DailyQuizQuestion, DailyQuizStatus } from "@/modules/daily-quiz";

interface QuizState {
  status: DailyQuizStatus | null;
  questions: DailyQuizQuestion[];
  readyCount: number;
  currentIndex: number;
  correctCount: number;
  total: number;
}

export default function DailyQuizPage() {
  const router = useRouter();
  const [state, setState] = useState<QuizState>({
    status: null,
    questions: [],
    readyCount: 0,
    currentIndex: 0,
    correctCount: 0,
    total: 50,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQuiz = useCallback(async () => {
    try {
      const res = await fetch("/api/daily-quiz");
      const json = await res.json();
      if (!json.success) return;

      const { status, quiz, progress, result } = json.data;

      if (result) {
        router.replace("/daily-quiz/report");
        return;
      }

      if (!quiz && !status) {
        const genRes = await fetch("/api/daily-quiz", { method: "POST" });
        const genJson = await genRes.json();
        if (genJson.success) {
          setState((prev) => ({
            ...prev,
            status: genJson.data.status,
            questions: genJson.data.quiz.questions,
            readyCount: genJson.data.quiz.readyCount,
            total: genJson.data.quiz.totalCount,
          }));
        }
      } else if (quiz) {
        setState((prev) => ({
          ...prev,
          status,
          questions: quiz.questions,
          readyCount: quiz.readyCount,
          total: quiz.totalCount,
          currentIndex: progress?.currentIndex ?? 0,
          correctCount: progress?.correctCount ?? 0,
        }));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state.status === "partial") {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/daily-quiz");
          const json = await res.json();
          if (json.success && json.data.quiz) {
            const quiz = json.data.quiz;
            setState((prev) => ({
              ...prev,
              status: quiz.status,
              questions: quiz.questions,
              readyCount: quiz.readyCount,
            }));
            if (quiz.status === "ready" && pollRef.current) {
              clearInterval(pollRef.current);
            }
          }
        } catch {}
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state.status]);

  const currentQuestion = state.questions[state.currentIndex];

  const handleSelect = async (answer: string) => {
    if (submitting || feedback) return;
    setSelectedAnswer(answer);
    setSubmitting(true);

    try {
      const res = await fetch("/api/daily-quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: currentQuestion.id, answer }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          isCorrect: json.data.isCorrect,
          correctAnswer: json.data.correctAnswer,
          explanation: json.data.explanation,
        });
        setState((prev) => ({
          ...prev,
          correctCount: json.data.progress.correctCount,
          currentIndex: json.data.progress.currentIndex,
        }));
      }
    } catch {
      setSelectedAnswer(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (state.currentIndex >= state.readyCount) {
      try {
        await fetch("/api/daily-quiz/complete", { method: "POST" });
      } catch {}
      router.push("/daily-quiz/report");
      return;
    }
    setSelectedAnswer(null);
    setFeedback(null);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <>
        <Header title="今日练习" />
        <PageContainer>
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-500">正在加载题目...</p>
          </div>
        </PageContainer>
      </>
    );
  }

  if (state.status === "generating" || (state.status === "partial" && state.questions.length === 0)) {
    return (
      <>
        <Header title="今日练习" />
        <PageContainer>
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-500">AI 正在为你准备题目...</p>
            <p className="text-xs text-gray-400">预计 10-15 秒</p>
          </div>
        </PageContainer>
      </>
    );
  }

  if (!currentQuestion) {
    return (
      <>
        <Header title="今日练习" />
        <PageContainer>
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <p className="text-sm text-gray-500">暂无题目</p>
            <button
              onClick={() => router.back()}
              className="text-sm text-blue-500 hover:underline"
            >
              返回
            </button>
          </div>
        </PageContainer>
      </>
    );
  }

  const displayIndex = Math.min(state.currentIndex, state.readyCount - 1);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <button onClick={() => router.back()} className="flex items-center text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-gray-700">
          {displayIndex + 1}/{state.readyCount}
        </span>
        <span className="flex items-center gap-1 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          {formatTime(elapsed)}
        </span>
      </header>

      <PageContainer>
        <div className="space-y-6">
          <div className="space-y-3">
            <span className="inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
              第 {displayIndex + 1} 题
            </span>
            <p className="text-base leading-relaxed text-gray-800">
              {currentQuestion.stem}
            </p>
          </div>

          <div className="space-y-3">
            {currentQuestion.options.map((opt) => {
              const isSelected = selectedAnswer === opt.label;
              const isCorrect = feedback && opt.label === feedback.correctAnswer;
              const isWrong = feedback && isSelected && !feedback.isCorrect;

              return (
                <button
                  key={opt.label}
                  onClick={() => handleSelect(opt.label)}
                  disabled={!!feedback || submitting}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                    !feedback && !isSelected && "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50",
                    !feedback && isSelected && "border-blue-400 bg-blue-50",
                    isCorrect && "border-green-400 bg-green-50",
                    isWrong && "border-red-400 bg-red-50",
                    feedback && !isCorrect && !isWrong && "border-gray-100 opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      !feedback && "bg-gray-100 text-gray-600",
                      isCorrect && "bg-green-500 text-white",
                      isWrong && "bg-red-500 text-white",
                    )}
                  >
                    {opt.label}
                  </span>
                  <span className="text-sm text-gray-700">{opt.text}</span>
                </button>
              );
            })}
          </div>

          {feedback && (
            <div
              className={cn(
                "rounded-xl border p-4",
                feedback.isCorrect ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
              )}
            >
              <p className="mb-1 text-sm font-medium">
                {feedback.isCorrect ? "✓ 回答正确！" : "✗ 回答错误"}
              </p>
              <p className="text-sm text-gray-600">{feedback.explanation}</p>
            </div>
          )}

          {feedback && (
            <button
              onClick={handleNext}
              className="w-full rounded-xl bg-blue-500 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              {state.currentIndex >= state.readyCount ? "查看报告" : "下一题"}
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="fixed bottom-0 left-0 right-0 h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(state.currentIndex / state.readyCount) * 100}%` }}
          />
        </div>
      </PageContainer>
    </>
  );
}
