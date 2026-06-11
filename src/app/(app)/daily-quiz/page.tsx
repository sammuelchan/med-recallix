"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, RefreshCw, Flag, AlertTriangle } from "lucide-react";
import { Header, PageContainer } from "@/shared/components/layout";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import type { DailyQuizQuestion, DailyQuizStatus } from "@/modules/daily-quiz";

/**
 * 答题状态设计:
 * - displayIndex: 当前展示给用户的题目索引（仅用户点"下一题"才递增）
 * - currentIndex: 服务端 progress 的已答题数（提交答案后立即更新）
 * - readyCount: 后端已生成的题目数（随 COW 异步补全递增）
 * - total: 总目标题数（50）
 *
 * 分离 displayIndex 和 currentIndex 是防止跳题的核心设计。
 */
interface QuizState {
  status: DailyQuizStatus | null;
  questions: DailyQuizQuestion[];
  readyCount: number;
  currentIndex: number;
  correctCount: number;
  total: number;
  displayIndex: number;
}

const EXAM_TIME_LIMIT = 75 * 60; // 75 minutes in seconds
const OVERTIME_WARNING_INTERVAL = 10 * 60; // every 10 min after overtime

export default function DailyQuizPage() {
  const router = useRouter();
  const [state, setState] = useState<QuizState>({
    status: null,
    questions: [],
    readyCount: 0,
    currentIndex: 0,
    correctCount: 0,
    total: 50,
    displayIndex: 0,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [overtimeNotified, setOvertimeNotified] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockedQuestionRef = useRef<DailyQuizQuestion | null>(null);
  const isAnsweringRef = useRef(false);
  const lastOvertimeAlert = useRef(0);

  const remainingTime = EXAM_TIME_LIMIT - elapsed;
  const isOvertime = remainingTime <= 0;

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
        const resumeIndex = progress?.currentIndex ?? 0;
        setState((prev) => ({
          ...prev,
          status,
          questions: quiz.questions,
          readyCount: quiz.readyCount,
          total: quiz.totalCount,
          currentIndex: resumeIndex,
          correctCount: progress?.correctCount ?? 0,
          displayIndex: resumeIndex,
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

  const hasQuestions = state.questions.length > 0;
  useEffect(() => {
    if (!hasQuestions) return;
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasQuestions]);

  useEffect(() => {
    if (state.status !== "partial") return;
    let cancelled = false;
    pollRef.current = setInterval(async () => {
      if (cancelled || isAnsweringRef.current) return;
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data.quiz) {
          const quiz = json.data.quiz;
          setState((prev) => {
            const merged = [...prev.questions];
            for (let i = prev.questions.length; i < quiz.questions.length; i++) {
              merged.push(quiz.questions[i]);
            }
            return {
              ...prev,
              status: quiz.status,
              questions: merged,
              readyCount: quiz.readyCount,
            };
          });
          if (quiz.status === "ready" && pollRef.current) {
            clearInterval(pollRef.current);
          }
        }
      } catch {}
    }, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state.status]);

  // When status transitions to in_progress but readyCount < total,
  // we still need to poll for continuation completion
  useEffect(() => {
    if (state.status !== "in_progress" || state.readyCount >= state.total) return;
    let cancelled = false;
    const poll = setInterval(async () => {
      if (cancelled || isAnsweringRef.current) return;
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data.quiz) {
          const quiz = json.data.quiz;
          setState((prev) => {
            const merged = [...prev.questions];
            for (let i = prev.questions.length; i < quiz.questions.length; i++) {
              merged.push(quiz.questions[i]);
            }
            const newReadyCount = Math.max(prev.readyCount, quiz.readyCount);
            return {
              ...prev,
              questions: merged,
              readyCount: newReadyCount,
            };
          });
          if (quiz.readyCount >= quiz.totalCount) {
            clearInterval(poll);
          }
        }
      } catch {}
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [state.status, state.readyCount, state.total]);

  const rawQuestion = state.questions[state.displayIndex];
  if (rawQuestion && !lockedQuestionRef.current) {
    lockedQuestionRef.current = rawQuestion;
  }
  const currentQuestion = lockedQuestionRef.current ?? rawQuestion;

  const handleSelect = (answer: string) => {
    if (feedback || submitting) return;
    setSelectedAnswer(answer);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedAnswer || !currentQuestion || submitting || feedback) return;
    isAnsweringRef.current = true;
    setSubmitting(true);

    try {
      const res = await fetch("/api/daily-quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: currentQuestion.id, answer: selectedAnswer }),
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
      } else {
        setSelectedAnswer(null);
        isAnsweringRef.current = false;
      }
    } catch {
      setSelectedAnswer(null);
      isAnsweringRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const isAllDone = useCallback((nextIdx: number) => {
    const allGenerated = state.readyCount >= state.total;
    const isLastReady = nextIdx >= state.readyCount;
    return nextIdx >= state.total || (isLastReady && allGenerated);
  }, [state.readyCount, state.total]);

  const handleNext = async () => {
    const nextDisplayIndex = state.displayIndex + 1;

    if (isAllDone(nextDisplayIndex)) {
      setCompleting(true);
      try {
        const completeRes = await fetch("/api/daily-quiz/complete", { method: "POST" });
        const completeJson = await completeRes.json();
        if (completeJson.success && completeJson.data) {
          sessionStorage.setItem("dailyQuizResult", JSON.stringify(completeJson.data));
        }
      } catch {}
      router.push("/daily-quiz/report");
      return;
    }

    lockedQuestionRef.current = null;
    isAnsweringRef.current = false;
    setSelectedAnswer(null);
    setFeedback(null);
    setShowFeedback(false);
    setFeedbackSent(false);

    setState((prev) => ({
      ...prev,
      displayIndex: nextDisplayIndex,
    }));
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setShowRegenerateConfirm(false);
    try {
      const res = await fetch("/api/daily-quiz/regenerate", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        lockedQuestionRef.current = null;
        isAnsweringRef.current = false;
        setSelectedAnswer(null);
        setFeedback(null);
        setElapsed(0);
        setOvertimeNotified(false);
        lastOvertimeAlert.current = 0;
        const quiz = json.data.quiz;
        setState({
          status: quiz.status,
          questions: quiz.questions,
          readyCount: quiz.readyCount,
          total: quiz.totalCount,
          currentIndex: 0,
          correctCount: 0,
          displayIndex: 0,
        });
      }
    } catch {
      // silently fail
    } finally {
      setRegenerating(false);
    }
  };

  const handleFeedback = async (type: string, correctAnswer?: string, comment?: string) => {
    if (!currentQuestion) return;
    try {
      await fetch("/api/daily-quiz/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          type,
          correctAnswer,
          comment,
        }),
      });
      setFeedbackSent(true);
      setShowFeedback(false);
    } catch {}
  };

  const formatCountdown = (seconds: number) => {
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const formatted = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return seconds < 0 ? `-${formatted}` : formatted;
  };

  // Overtime notification
  useEffect(() => {
    if (!isOvertime) return;
    if (!overtimeNotified) {
      setOvertimeNotified(true);
      lastOvertimeAlert.current = elapsed;
      return;
    }
    const sinceLast = elapsed - lastOvertimeAlert.current;
    if (sinceLast >= OVERTIME_WARNING_INTERVAL) {
      lastOvertimeAlert.current = elapsed;
    }
  }, [elapsed, isOvertime, overtimeNotified]);

  if (loading) {
    return (
      <>
        <Header title="今日练习" />
        <PageContainer>
          <div className="space-y-5 py-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="rounded-2xl border p-5 space-y-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
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

  // Waiting for more questions to be generated
  if (!currentQuestion && state.displayIndex < state.total && state.readyCount > 0) {
    return (
      <>
        <Header title="今日练习" />
        <PageContainer>
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-700 font-medium">
              已完成 {state.displayIndex} 题，正在准备更多题目...
            </p>
            <p className="text-xs text-gray-400">
              已生成 {state.readyCount}/{state.total} 题，请稍候
            </p>
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

  const displayIndex = Math.min(state.displayIndex, Math.max(state.readyCount, 1) - 1);
  const nextIdx = state.displayIndex + 1;
  const isLastQuestion = isAllDone(nextIdx);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <button onClick={() => router.back()} className="flex items-center text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-gray-700">
          {displayIndex + 1}/{state.total}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={regenerating}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            title="换一套题"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
          </button>
          <span
            className={cn(
              "flex items-center gap-1 text-sm tabular-nums",
              isOvertime
                ? "font-medium text-red-500"
                : remainingTime <= 5 * 60
                  ? "font-medium text-orange-500"
                  : "text-gray-500",
            )}
          >
            <Clock className="h-4 w-4" />
            {formatCountdown(remainingTime)}
          </span>
        </div>
      </header>

      {/* Overtime banner */}
      {isOvertime && overtimeNotified && !feedback && (
        <div className="sticky top-14 z-30 flex items-center gap-2 bg-red-50 px-4 py-2 text-xs text-red-600 border-b border-red-100">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>考试时间已到，你仍可继续作答，但超时部分不计入模拟成绩</span>
        </div>
      )}

      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <p className="mb-2 text-base font-semibold text-gray-800 dark:text-gray-200">
              确认换一套题？
            </p>
            <p className="mb-5 text-sm text-gray-500">
              当前答题进度将清零，系统会重新为你生成一套新题目。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRegenerate}
                className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                确认换题
              </button>
            </div>
          </div>
        </div>
      )}

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
                    "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98]",
                    !feedback && !isSelected && "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-50/80",
                    !feedback && isSelected && "border-blue-400 bg-blue-50 ring-2 ring-blue-200",
                    isCorrect && "border-green-400 bg-green-50",
                    isWrong && "border-red-400 bg-red-50",
                    feedback && !isCorrect && !isWrong && "border-gray-100 opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      !feedback && !isSelected && "bg-gray-100 text-gray-600",
                      !feedback && isSelected && "bg-blue-500 text-white",
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

          {/* Confirm submit button - shown when answer selected but not yet submitted */}
          {selectedAnswer && !feedback && (
            <button
              onClick={handleConfirmSubmit}
              disabled={submitting}
              className={cn(
                "w-full rounded-xl py-3 text-sm font-medium text-white transition-colors",
                submitting
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
              )}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  提交中...
                </span>
              ) : (
                "确认提交"
              )}
            </button>
          )}

          {feedback && (
            <div
              className={cn(
                "rounded-xl border p-4",
                feedback.isCorrect ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium">
                  {feedback.isCorrect ? "✓ 回答正确！" : "✗ 回答错误"}
                </p>
                {currentQuestion?.generatedBy && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                    {currentQuestion.generatedBy === "qa_pair" ? "来源: 知识点QA" :
                     currentQuestion.generatedBy === "ai" ? "来源: AI生成" : "来源: 题库"}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">{feedback.explanation}</p>
              <div className="mt-2 flex items-center gap-2">
                {!feedbackSent ? (
                  <button
                    onClick={() => setShowFeedback(true)}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors hover:border-orange-300 hover:text-orange-600"
                  >
                    <Flag className="h-3 w-3" />
                    报告问题
                  </button>
                ) : (
                  <span className="text-xs text-green-600">已收到反馈，感谢！</span>
                )}
              </div>
            </div>
          )}

          {showFeedback && (
            <FeedbackDialog
              onSubmit={handleFeedback}
              onClose={() => setShowFeedback(false)}
            />
          )}

          {feedback && (
            <button
              onClick={handleNext}
              disabled={completing}
              className={cn(
                "w-full rounded-xl py-3 text-sm font-medium text-white transition-colors",
                completing
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600",
              )}
            >
              {completing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  正在生成报告...
                </span>
              ) : isLastQuestion ? (
                "查看报告"
              ) : (
                "下一题"
              )}
            </button>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 h-1 bg-gray-100 safe-bottom">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((state.displayIndex + (feedback ? 1 : 0)) / state.total) * 100}%` }}
          />
        </div>
      </PageContainer>
    </>
  );
}

function FeedbackDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (type: string, correctAnswer?: string, comment?: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState("wrong_answer");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900">
        <p className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-200">
          反馈题目问题
        </p>

        <div className="mb-3 space-y-2">
          {[
            { value: "wrong_answer", label: "答案错误" },
            { value: "irrelevant_options", label: "选项与题干无关" },
            { value: "unclear_stem", label: "题干表述不清" },
            { value: "other", label: "其他问题" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="feedback_type"
                value={opt.value}
                checked={type === opt.value}
                onChange={(e) => setType(e.target.value)}
                className="h-4 w-4 text-blue-500"
              />
              {opt.label}
            </label>
          ))}
        </div>

        {type === "wrong_answer" && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-500">你认为正确答案是</label>
            <div className="flex gap-2">
              {["A", "B", "C", "D", "E"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCorrectAnswer(opt)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    correctAnswer === opt
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-blue-100",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs text-gray-500">补充说明（可选）</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="请描述具体问题..."
            className="w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:border-blue-300"
            rows={2}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSubmit(type, correctAnswer || undefined, comment || undefined)}
            className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            提交反馈
          </button>
        </div>
      </div>
    </div>
  );
}
