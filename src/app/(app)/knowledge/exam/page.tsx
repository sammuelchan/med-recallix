"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import {
  Loader2,
  Send,
  Eye,
  ChevronRight,
  Trophy,
  Target,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  User,
  ArrowLeft,
  BookX,
} from "lucide-react";
import type { KPIndexItem } from "@/modules/knowledge";
import type { ExamQuestion, ExamEvaluation } from "@/modules/exam";

type Phase = "setup" | "loading" | "exam" | "evaluating" | "feedback" | "result";

interface AnswerRecord {
  userAnswer: string;
  evaluation?: ExamEvaluation;
  referenceViewed: boolean;
}

function ScoreRing({ score, size = 64, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }} role="meter" aria-label={`${label}: ${score}分`} aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <svg className="rotate-[-90deg]" width={size} height={size} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            className="text-muted/30"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-lg font-bold", color)}>{score}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={null}>
      <ExamPageInner />
    </Suspense>
  );
}

function ExamPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category");

  const [phase, setPhase] = useState<Phase>("setup");
  const [kpList, setKpList] = useState<KPIndexItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [loadingKP, setLoadingKP] = useState(true);
  const [wrongCount, setWrongCount] = useState(0);
  const [genProgress, setGenProgress] = useState(0);

  // 离开拦截: 生成中或答题中离开页面时提醒，避免 token 浪费
  useEffect(() => {
    const shouldBlock = phase === "loading" || phase === "exam" || phase === "evaluating" || phase === "feedback";
    if (!shouldBlock) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setKpList(json.data);
      })
      .finally(() => setLoadingKP(false));
  }, []);

  const categories = useMemo(() => {
    const catSet = new Set<string>();
    kpList.forEach((item) => {
      if (item.category[0]) catSet.add(item.category[0]);
    });
    return Array.from(catSet);
  }, [kpList]);

  const filteredCount = useMemo(() => {
    if (!selectedCategory) return kpList.length;
    return kpList.filter((item) => item.category[0] === selectedCategory).length;
  }, [kpList, selectedCategory]);

  const startExam = useCallback(async () => {
    setError("");
    setPhase("loading");
    setGenProgress(0);

    // 模拟进度动画: 0→90% 在 15s 内渐进，给用户等待反馈
    const progressTimer = setInterval(() => {
      setGenProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + (90 - prev) * 0.08;
      });
    }, 500);

    try {
      const res = await fetch("/api/exam/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          count: 10,
        }),
      });

      clearInterval(progressTimer);
      setGenProgress(100);

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (!json.data?.length) throw new Error("未能生成题目，请确保有足够的知识点");

      setQuestions(json.data);
      setCurrentIdx(0);
      setAnswers({});
      setInputValue("");
      setPhase("exam");
    } catch (err) {
      clearInterval(progressTimer);
      setGenProgress(0);
      setError(err instanceof Error ? err.message : "生成失败");
      setPhase("setup");
    }
  }, [selectedCategory]);

  const submitAnswer = useCallback(async () => {
    const q = questions[currentIdx];
    if (!q || !inputValue.trim()) return;

    const userAnswer = inputValue.trim();
    setPhase("evaluating");

    try {
      const res = await fetch("/api/exam/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          referenceAnswer: q.referenceAnswer,
          userAnswer,
          source: q.source,
          category: q.category,
          knowledgePointId: q.knowledgePointId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const evaluation = json.data;
      setAnswers((prev) => ({
        ...prev,
        [q.id]: {
          userAnswer,
          evaluation,
          referenceViewed: false,
        },
      }));

      // Track wrong count from server-side save confirmation
      if (evaluation?.savedToWrongBook) {
        setWrongCount((c) => c + 1);
      }

      setPhase("feedback");
    } catch (err) {
      setAnswers((prev) => ({
        ...prev,
        [q.id]: {
          userAnswer,
          evaluation: undefined,
          referenceViewed: false,
        },
      }));
      setError(err instanceof Error ? err.message : "评估失败");
      setPhase("feedback");
    }
  }, [questions, currentIdx, inputValue]);

  const viewReference = useCallback(() => {
    const q = questions[currentIdx];
    if (!q) return;
    setAnswers((prev) => ({
      ...prev,
      [q.id]: { ...prev[q.id], referenceViewed: true },
    }));
  }, [questions, currentIdx]);

  const nextQuestion = useCallback(() => {
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx((prev) => prev + 1);
      setInputValue("");
      setError("");
      setPhase("exam");
    } else {
      setPhase("result");
    }
  }, [currentIdx, questions.length]);

  const endExamEarly = useCallback(() => {
    setPhase("result");
  }, []);

  const currentQ = questions[currentIdx];
  const currentAnswer = currentQ ? answers[currentQ.id] : undefined;

  const resultStats = useMemo(() => {
    const answered = Object.values(answers).filter((a) => a.evaluation);
    if (answered.length === 0) return null;

    const avgSim = Math.round(answered.reduce((s, a) => s + (a.evaluation?.similarity ?? 0), 0) / answered.length);
    const avgComp = Math.round(answered.reduce((s, a) => s + (a.evaluation?.completeness ?? 0), 0) / answered.length);
    const avgOverall = Math.round(answered.reduce((s, a) => s + (a.evaluation?.overall ?? 0), 0) / answered.length);

    return {
      total: questions.length,
      answered: answered.length,
      avgSimilarity: avgSim,
      avgCompleteness: avgComp,
      avgOverall: avgOverall,
    };
  }, [answers, questions.length]);

  // --- Setup Phase ---
  if (phase === "setup") {
    return (
      <>
        <Header
          title="问答测验"
          action={
            <button onClick={() => router.back()} className="text-muted-foreground" aria-label="返回">
              <ArrowLeft className="size-5" />
            </button>
          }
        />
        <PageContainer>
          <div className="space-y-6">
            <div className="text-center space-y-2 py-4">
              <div className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="size-8 text-primary" />
              </div>
              <h2 className="text-lg font-bold">沉浸式问答测验</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI 出题，你来回答，AI 打分评估
                <br />
                通过主动回忆强化记忆效果
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {loadingKP ? (
              <div className="flex justify-center py-8">
                <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : kpList.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-4xl mb-4">📝</p>
                <p>先添加知识点才能测验</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <label className="text-sm font-medium">选择测验范围</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-medium transition-all",
                        !selectedCategory
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >
                      全部 ({kpList.length})
                    </button>
                    {categories.map((cat) => {
                      const catCount = kpList.filter((kp) => kp.category[0] === cat).length;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                          className={cn(
                            "rounded-full px-4 py-2 text-sm font-medium transition-all",
                            selectedCategory === cat
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                          )}
                        >
                          {cat} ({catCount})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="size-4 text-primary" />
                    <span className="font-medium">测验说明</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                    <li>AI 会根据知识点内容出题，包含你录入的问答和 AI 扩展题</li>
                    <li>每题先看问题，输入你的答案后 AI 会评分</li>
                    <li>评分后可以查看参考答案，对比学习</li>
                    <li>随时可以提前结束测验，查看总成绩</li>
                  </ul>
                </div>

                <Button
                  className="w-full h-12 text-base"
                  disabled={filteredCount === 0}
                  onClick={startExam}
                >
                  <Sparkles className="size-4 mr-2" />
                  开始测验 ({filteredCount} 个知识点)
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/30"
                  onClick={() => router.push("/knowledge/exam/wrong-answers")}
                >
                  <BookX className="size-4 mr-2" />
                  错题本
                </Button>
              </>
            )}
          </div>
        </PageContainer>
      </>
    );
  }

  // --- Loading Phase (带进度条和离开提醒) ---
  if (phase === "loading") {
    return (
      <>
        <Header title="问答测验" />
        <PageContainer className="flex items-center justify-center">
          <div className="text-center space-y-5 w-full max-w-xs">
            <Loader2 className="size-10 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-medium">AI 正在出题...</p>
              <p className="text-sm text-muted-foreground mt-1">
                综合知识点内容生成测验题目
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${Math.round(genProgress)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {Math.round(genProgress)}% · 预计 10-15 秒，请勿离开
              </p>
            </div>
          </div>
        </PageContainer>
      </>
    );
  }

  // --- Result Phase ---
  if (phase === "result") {
    const stats = resultStats;
    return (
      <>
        <Header title="测验结果" />
        <PageContainer>
          <div className="space-y-6">
            <div className="text-center space-y-3 py-4">
              <p className="text-5xl">
                {stats && stats.avgOverall >= 80 ? "🏆" : stats && stats.avgOverall >= 60 ? "👍" : "💪"}
              </p>
              {stats ? (
                <>
                  <h2 className="text-2xl font-bold">{stats.avgOverall} 分</h2>
                  <p className="text-muted-foreground text-sm">
                    完成 {stats.answered}/{stats.total} 题
                  </p>
                </>
              ) : (
                <h2 className="text-xl font-bold text-muted-foreground">未作答</h2>
              )}
            </div>

            {stats && (
              <div className="flex justify-center gap-8">
                <ScoreRing score={stats.avgSimilarity} label="相似度" />
                <ScoreRing score={stats.avgCompleteness} label="完整度" />
                <ScoreRing score={stats.avgOverall} label="综合" />
              </div>
            )}

            {/* Per-question details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">答题详情</h3>
              {questions.map((q, i) => {
                const ans = answers[q.id];
                const ev = ans?.evaluation;
                return (
                  <div key={q.id} className="rounded-xl border p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 size-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium flex-1">{q.question}</p>
                      {ev && (
                        <span
                          className={cn(
                            "shrink-0 text-xs font-bold px-2 py-0.5 rounded-full",
                            ev.overall >= 80
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : ev.overall >= 60
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          )}
                        >
                          {ev.overall}分
                        </span>
                      )}
                    </div>
                    {ans ? (
                      <div className="ml-8 space-y-1.5">
                        <div className="text-xs">
                          <span className="text-muted-foreground">你的回答：</span>
                          <span className="text-foreground">{ans.userAnswer}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">参考答案：</span>
                          <span className="text-green-600 dark:text-green-400">{q.referenceAnswer}</span>
                        </div>
                        {ev?.feedback && (
                          <p className="text-xs text-muted-foreground italic">{ev.feedback}</p>
                        )}
                      </div>
                    ) : (
                      <p className="ml-8 text-xs text-muted-foreground">未作答</p>
                    )}
                  </div>
                );
              })}
            </div>

            {wrongCount > 0 && (
              <Button
                variant="outline"
                className="w-full border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/30"
                onClick={() => router.push("/knowledge/exam/wrong-answers")}
              >
                <BookX className="size-4 mr-2" />
                查看错题本 ({wrongCount} 道错题已收录)
              </Button>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push("/knowledge")}
              >
                返回知识点
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setPhase("setup");
                  setQuestions([]);
                  setAnswers({});
                  setCurrentIdx(0);
                  setInputValue("");
                  setError("");
                }}
              >
                再来一次
              </Button>
            </div>
          </div>
        </PageContainer>
      </>
    );
  }

  // --- Exam / Evaluating / Feedback Phase ---
  return (
    <>
      <Header
        title={`第 ${currentIdx + 1}/${questions.length} 题`}
        action={
          <button
            onClick={endExamEarly}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="提前结束测验"
          >
            <X className="size-3.5" />
            结束
          </button>
        }
      />
      <PageContainer>
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${((currentIdx + (phase === "feedback" ? 1 : 0)) / questions.length) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {currentQ?.source === "ai" ? (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3" />
                    AI 扩展题
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3" />
                    知识点原题
                  </span>
                )}
              </span>
              <span>{currentQ?.category.join(" > ")}</span>
            </div>
          </div>

          {/* Question card */}
          <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
            <p className="text-xs text-primary font-semibold mb-3 flex items-center gap-1.5">
              <Target className="size-3.5" />
              问题
            </p>
            <p className="text-base font-medium leading-relaxed">{currentQ?.question}</p>
          </div>

          {/* Answer input area (exam phase) */}
          {phase === "exam" && (
            <div className="space-y-3">
              <Textarea
                placeholder="在此输入你的答案..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="min-h-[120px] text-sm"
                autoFocus
              />
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              <Button
                className="w-full"
                disabled={!inputValue.trim()}
                onClick={submitAnswer}
              >
                <Send className="size-4 mr-2" />
                提交答案
              </Button>
            </div>
          )}

          {/* Evaluating phase */}
          {phase === "evaluating" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">AI 正在评估你的答案...</p>
            </div>
          )}

          {/* Feedback phase */}
          {phase === "feedback" && currentAnswer && (
            <div className="space-y-4">
              {/* User's answer */}
              <div className="rounded-xl border p-4 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">你的回答</p>
                <p className="text-sm whitespace-pre-wrap">{currentAnswer.userAnswer}</p>
              </div>

              {/* AI scoring */}
              {currentAnswer.evaluation ? (
                <div className="rounded-xl border-2 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    {currentAnswer.evaluation.overall >= 80 ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : currentAnswer.evaluation.overall >= 60 ? (
                      <AlertTriangle className="size-5 text-yellow-500" />
                    ) : (
                      <X className="size-5 text-red-500" />
                    )}
                    <span className="font-semibold">AI 评分</span>
                  </div>

                  <div className="flex justify-around">
                    <ScoreRing score={currentAnswer.evaluation.similarity} size={56} label="相似度" />
                    <ScoreRing score={currentAnswer.evaluation.completeness} size={56} label="完整度" />
                    <ScoreRing score={currentAnswer.evaluation.overall} size={56} label="综合" />
                  </div>

                  {currentAnswer.evaluation.feedback && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      {currentAnswer.evaluation.feedback}
                    </p>
                  )}

                  {currentAnswer.evaluation.missingPoints.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-orange-600 dark:text-orange-400">遗漏要点：</p>
                      <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                        {currentAnswer.evaluation.missingPoints.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
                  <AlertTriangle className="size-5 mx-auto mb-2 text-yellow-500" />
                  AI 评分暂时不可用
                  {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                </div>
              )}

              {/* Reference answer toggle */}
              {!currentAnswer.referenceViewed ? (
                <button
                  onClick={viewReference}
                  className="w-full rounded-xl border-2 border-dashed p-4 text-center transition-colors hover:bg-muted/30"
                >
                  <Eye className="size-5 mx-auto mb-1.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">点击查看参考答案</span>
                </button>
              ) : (
                <div className="rounded-xl border-2 border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20 p-4 space-y-1.5">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">参考答案</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {currentQ?.referenceAnswer}
                  </p>
                </div>
              )}

              {/* Next button */}
              <Button className="w-full" onClick={nextQuestion}>
                {currentIdx + 1 < questions.length ? (
                  <>
                    下一题
                    <ChevronRight className="size-4 ml-1" />
                  </>
                ) : (
                  <>
                    <Trophy className="size-4 mr-2" />
                    查看测验结果
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
