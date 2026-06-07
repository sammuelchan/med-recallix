"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  BookOpen,
  CreditCard,
  PenLine,
} from "lucide-react";
import type { Card, ReviewGrade } from "@/modules/review";
import type { KnowledgePoint, QAPair } from "@/modules/knowledge";

type ReviewDisplayMode = "qa" | "fill-blank" | "card";

interface KPData {
  content: string;
  contentMode: string;
  qaItems?: QAPair[];
}

function getStoredMode(): ReviewDisplayMode {
  if (typeof window === "undefined") return "qa";
  return (localStorage.getItem("reviewMode") as ReviewDisplayMode) ?? "qa";
}

function BlankText({
  answer,
  blanks,
  revealed,
}: {
  answer: string;
  blanks: { start: number; end: number; text: string }[];
  revealed: boolean;
}) {
  if (!blanks || blanks.length === 0 || revealed) {
    return <span>{answer}</span>;
  }

  const sorted = [...blanks].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < sorted.length; i++) {
    const blank = sorted[i];
    if (blank.start > lastEnd) {
      parts.push(<span key={`t${i}`}>{answer.slice(lastEnd, blank.start)}</span>);
    }
    parts.push(
      <span
        key={`b${i}`}
        className="inline-block min-w-[3em] border-b-2 border-dashed border-primary/50 mx-0.5 text-center"
      >
        {revealed ? blank.text : "\u00A0\u00A0\u00A0\u00A0"}
      </span>,
    );
    lastEnd = blank.end;
  }
  if (lastEnd < answer.length) {
    parts.push(<span key="end">{answer.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}

export default function ReviewPage() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [mode, setMode] = useState<ReviewDisplayMode>(getStoredMode);

  // Card-mode state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [kpContent, setKpContent] = useState("");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState("");

  // QA/fill-blank state
  const [kpData, setKpData] = useState<KPData | null>(null);
  const [loadingKP, setLoadingKP] = useState(false);
  const [qaIdx, setQaIdx] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [kpSummary, setKpSummary] = useState<{
    total: number;
    remembered: number;
  } | null>(null);

  // Reset state
  const [resetting, setResetting] = useState(false);

  const handleResetAllToday = useCallback(async () => {
    setResetting(true);
    try {
      const cardIds = cards.length > 0 ? cards.map((c) => c.id) : undefined;
      await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      });
      window.location.reload();
    } catch {
      setResetting(false);
    }
  }, [cards]);

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data.length > 0) {
          setCards(json.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("reviewMode", mode);
  }, [mode]);

  const currentCard = cards[currentIdx];

  const loadKPData = useCallback(async (kpId: string) => {
    setLoadingKP(true);
    try {
      const res = await fetch(`/api/knowledge/${kpId}`);
      const json = await res.json();
      if (json.success) {
        const kp: KnowledgePoint = json.data;
        setKpData({
          content: kp.content,
          contentMode: kp.contentMode ?? "text",
          qaItems: kp.qaItems,
        });
        setKpContent(kp.content);
      }
    } catch {
      setKpContent("内容加载失败");
      setKpData(null);
    } finally {
      setLoadingKP(false);
    }
  }, []);

  const currentCardId = currentCard?.id;
  const prevCardIdRef = useRef<string | undefined>(undefined);
  if (currentCardId !== prevCardIdRef.current) {
    prevCardIdRef.current = currentCardId;
    if (currentCardId) {
      setKpContent("");
      setKpData(null);
      setLoadingKP(false);
      setFlipped(false);
      setQaIdx(0);
      setAnswerRevealed(false);
      setKpSummary(null);
    }
  }

  const currentQAItems = useMemo(() => {
    if (!kpData?.qaItems || kpData.qaItems.length === 0) return null;
    return kpData.qaItems;
  }, [kpData]);

  async function handleFlip() {
    if (!flipped && currentCard) {
      await loadKPData(currentCard.knowledgePointId);
    }
    setFlipped(!flipped);
  }

  async function submitGrade(grade: ReviewGrade) {
    if (!currentCard || grading) return;
    setGrading(true);
    setGradeError("");

    try {
      const res = await fetch(`/api/cards/${currentCard.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "评分提交失败" }));
        setGradeError(json.error ?? "评分提交失败，请重试");
        setGrading(false);
        return;
      }

      setReviewed((prev) => prev + 1);

      if (currentIdx + 1 < cards.length) {
        setCurrentIdx((prev) => prev + 1);
      } else {
        setDone(true);
      }
    } catch {
      setGradeError("网络错误，请重试");
    } finally {
      setGrading(false);
    }
  }

  function handleQAGrade(remembered: boolean) {
    if (!currentQAItems) return;

    const isLast = qaIdx >= currentQAItems.length - 1;

    if (isLast) {
      const total = currentQAItems.length;
      const prevRemembered = kpSummary?.remembered ?? 0;
      const finalRemembered = prevRemembered + (remembered ? 1 : 0);

      setKpSummary({ total, remembered: finalRemembered });

      const avgGrade: ReviewGrade = finalRemembered >= total * 0.8 ? 4 : finalRemembered >= total * 0.5 ? 3 : 1;
      submitGrade(avgGrade);
    } else {
      setKpSummary((prev) => ({
        total: currentQAItems.length,
        remembered: (prev?.remembered ?? 0) + (remembered ? 1 : 0),
      }));
      setQaIdx((prev) => prev + 1);
      setAnswerRevealed(false);
    }
  }

  // --- Loading state ---
  if (loading) {
    return (
      <>
        <Header title="复习" />
        <PageContainer className="flex items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </PageContainer>
      </>
    );
  }

  // --- Empty state ---
  if (cards.length === 0) {
    return (
      <>
        <Header title="复习" />
        <PageContainer className="flex items-center justify-center">
          <div className="text-center text-muted-foreground space-y-3">
            <p className="text-4xl mb-4">📚</p>
            <p>暂无待复习的卡片</p>
            <p className="text-sm mt-1">先去添加知识点吧</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAllToday}
              disabled={resetting}
            >
              <RotateCcw className="size-3.5 mr-1" />
              {resetting ? "重置中..." : "重新复习今天的卡片"}
            </Button>
          </div>
        </PageContainer>
      </>
    );
  }

  // --- Done state ---
  if (done) {
    return (
      <>
        <Header title="复习完成" />
        <PageContainer className="flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-5xl">🎉</p>
            <h2 className="text-xl font-bold">太棒了！</h2>
            <p className="text-muted-foreground">
              你今天复习了 {reviewed} 个知识点
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => router.push("/dashboard")}>
                返回首页
              </Button>
              <Button
                variant="outline"
                onClick={handleResetAllToday}
                disabled={resetting}
              >
                <RotateCcw className="size-4 mr-1.5" />
                {resetting ? "重置中..." : "再来一轮"}
              </Button>
            </div>
          </div>
        </PageContainer>
      </>
    );
  }

  // --- Mode selector ---
  const modeSelector = (
    <div className="flex rounded-lg border p-0.5 gap-0.5 mb-4">
      <button
        type="button"
        onClick={() => setMode("qa")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          mode === "qa"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <BookOpen className="size-3" />
        问答
      </button>
      <button
        type="button"
        onClick={() => setMode("fill-blank")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          mode === "fill-blank"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <PenLine className="size-3" />
        填空
      </button>
      <button
        type="button"
        onClick={() => setMode("card")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          mode === "card"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <CreditCard className="size-3" />
        卡片
      </button>
    </div>
  );

  // --- CARD mode (original behavior) ---
  if (mode === "card") {
    return (
      <>
        <Header title={`复习 ${currentIdx + 1}/${cards.length}`} />
        <PageContainer>
          <div className="space-y-6">
            {modeSelector}
            <div
              onClick={handleFlip}
              className={cn(
                "relative min-h-[200px] cursor-pointer rounded-2xl border-2 p-6 transition-all",
                flipped
                  ? "border-primary/30 bg-primary/5"
                  : "border-muted hover:border-primary/20",
              )}
            >
              {!flipped ? (
                <div className="flex flex-col items-center justify-center min-h-[180px] gap-4">
                  <h2 className="text-xl font-bold text-center">
                    {currentCard.title}
                  </h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <RotateCcw className="size-3" />
                    点击翻转查看答案
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-semibold text-primary">{currentCard.title}</h3>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {kpContent || "加载中..."}
                  </div>
                </div>
              )}
            </div>

            {gradeError && (
              <p className="text-sm text-destructive text-center">{gradeError}</p>
            )}

            {flipped && (
              <div className="flex gap-3">
                <Button
                  onClick={() => submitGrade(1)}
                  disabled={grading}
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="size-4 mr-1.5" />
                  遗忘
                </Button>
                <Button
                  onClick={() => submitGrade(4)}
                  disabled={grading}
                  className="flex-1"
                >
                  <CheckCircle2 className="size-4 mr-1.5" />
                  记住
                </Button>
              </div>
            )}
          </div>
        </PageContainer>
      </>
    );
  }

  // --- QA / Fill-blank mode ---
  const needsLoad = !kpData && !loadingKP && currentCard;

  if (needsLoad) {
    loadKPData(currentCard.knowledgePointId);
  }

  const isQAMode = mode === "qa";
  const isFillMode = mode === "fill-blank";

  const qaItemsAvailable = currentQAItems && currentQAItems.length > 0;
  const currentQA = qaItemsAvailable ? currentQAItems[qaIdx] : null;

  // Fallback for text-mode knowledge points reviewed in QA/fill mode
  if (kpData && kpData.contentMode === "text" && !qaItemsAvailable) {
    return (
      <>
        <Header title={`复习 ${currentIdx + 1}/${cards.length}`} />
        <PageContainer>
          <div className="space-y-6">
            {modeSelector}
            <div className="rounded-2xl border-2 p-6 space-y-4">
              <h2 className="text-lg font-bold">{currentCard.title}</h2>
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {answerRevealed ? (
                  kpData.content
                ) : (
                  <button
                    onClick={() => setAnswerRevealed(true)}
                    className="w-full py-8 text-center border-2 border-dashed rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <Eye className="size-5 mx-auto mb-2 text-muted-foreground" />
                    <span>点击查看内容</span>
                  </button>
                )}
              </div>
            </div>

            {gradeError && (
              <p className="text-sm text-destructive text-center">{gradeError}</p>
            )}

            {answerRevealed && (
              <div className="flex gap-3">
                <Button
                  onClick={() => submitGrade(1)}
                  disabled={grading}
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="size-4 mr-1.5" />
                  遗忘
                </Button>
                <Button
                  onClick={() => submitGrade(4)}
                  disabled={grading}
                  className="flex-1"
                >
                  <CheckCircle2 className="size-4 mr-1.5" />
                  记住
                </Button>
              </div>
            )}
          </div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header
        title={`复习 ${currentIdx + 1}/${cards.length}${
          currentQA ? ` · 第${qaIdx + 1}/${currentQAItems!.length}题` : ""
        }`}
      />
      <PageContainer>
        <div className="space-y-6">
          {modeSelector}

          {!kpData ? (
            <div className="flex justify-center py-12">
              <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          ) : currentQA ? (
            <>
              {/* Knowledge point title */}
              <div className="text-xs text-muted-foreground font-medium px-1">
                {currentCard.title}
              </div>

              {/* Question */}
              <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
                <p className="text-xs text-primary font-medium mb-2">问题</p>
                <p className="text-base font-medium">{currentQA.question}</p>
              </div>

              {/* Answer area */}
              <div className="rounded-2xl border-2 p-5 min-h-[120px]">
                {!answerRevealed ? (
                  <button
                    onClick={() => setAnswerRevealed(true)}
                    className="w-full py-6 text-center"
                  >
                    <Eye className="size-5 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {isFillMode ? "点击揭示答案" : "点击显示答案"}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-green-600 font-medium">答案</p>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {isFillMode && currentQA.blanks && currentQA.blanks.length > 0 ? (
                        <BlankText
                          answer={currentQA.answer}
                          blanks={currentQA.blanks}
                          revealed={true}
                        />
                      ) : (
                        currentQA.answer
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Fill-blank preview (before reveal) */}
              {isFillMode && !answerRevealed && currentQA.blanks && currentQA.blanks.length > 0 && (
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground mb-2">填空提示</p>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    <BlankText
                      answer={currentQA.answer}
                      blanks={currentQA.blanks}
                      revealed={false}
                    />
                  </div>
                </div>
              )}

              {gradeError && (
                <p className="text-sm text-destructive text-center">{gradeError}</p>
              )}

              {/* Grade buttons */}
              {answerRevealed && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleQAGrade(false)}
                    disabled={grading}
                    variant="outline"
                    className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="size-4 mr-1.5" />
                    遗忘
                  </Button>
                  <Button
                    onClick={() => handleQAGrade(true)}
                    disabled={grading}
                    className="flex-1"
                  >
                    <CheckCircle2 className="size-4 mr-1.5" />
                    记住
                  </Button>
                </div>
              )}

              {/* Progress dots */}
              {currentQAItems && currentQAItems.length > 1 && (
                <div className="flex justify-center gap-1.5 pt-2">
                  {currentQAItems.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "size-2 rounded-full transition-colors",
                        i === qaIdx
                          ? "bg-primary"
                          : i < qaIdx
                            ? "bg-primary/30"
                            : "bg-muted",
                      )}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p>该知识点暂无问答内容</p>
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
