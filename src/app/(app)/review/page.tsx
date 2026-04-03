"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { RotateCcw, Check } from "lucide-react";
import type { Card, ReviewGrade } from "@/modules/review";

const GRADE_OPTIONS: { grade: ReviewGrade; label: string; desc: string; color: string }[] = [
  { grade: 0, label: "完全不记得", desc: "需要重新学习", color: "bg-red-500" },
  { grade: 1, label: "几乎不记得", desc: "有点印象但错误", color: "bg-orange-500" },
  { grade: 2, label: "勉强想起", desc: "想了很久才记起", color: "bg-yellow-500" },
  { grade: 3, label: "有点困难", desc: "有些犹豫但正确", color: "bg-blue-400" },
  { grade: 4, label: "比较轻松", desc: "稍加思考就想起", color: "bg-green-400" },
  { grade: 5, label: "非常容易", desc: "脱口而出", color: "bg-green-600" },
];

export default function ReviewPage() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [kpContent, setKpContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [done, setDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);

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

  const currentCard = cards[currentIdx];

  const loadContent = useCallback(async (kpId: string) => {
    try {
      const res = await fetch(`/api/knowledge/${kpId}`);
      const json = await res.json();
      if (json.success) setKpContent(json.data.content);
    } catch {
      setKpContent("内容加载失败");
    }
  }, []);

  useEffect(() => {
    if (currentCard) {
      setKpContent("");
      setFlipped(false);
    }
  }, [currentCard]);

  async function handleFlip() {
    if (!flipped && currentCard) {
      await loadContent(currentCard.knowledgePointId);
    }
    setFlipped(!flipped);
  }

  async function handleGrade(grade: ReviewGrade) {
    if (!currentCard || grading) return;
    setGrading(true);

    await fetch(`/api/cards/${currentCard.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade }),
    });

    setReviewed((prev) => prev + 1);
    setGrading(false);

    if (currentIdx + 1 < cards.length) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setDone(true);
    }
  }

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

  if (cards.length === 0) {
    return (
      <>
        <Header title="复习" />
        <PageContainer className="flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p className="text-4xl mb-4">📚</p>
            <p>暂无待复习的卡片</p>
            <p className="text-sm mt-1">先去添加知识点吧</p>
          </div>
        </PageContainer>
      </>
    );
  }

  if (done) {
    return (
      <>
        <Header title="复习完成" />
        <PageContainer className="flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-5xl">🎉</p>
            <h2 className="text-xl font-bold">太棒了！</h2>
            <p className="text-muted-foreground">
              你今天复习了 {reviewed} 张卡片
            </p>
            <Button onClick={() => router.push("/dashboard")}>
              返回首页
            </Button>
          </div>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header
        title={`复习 ${currentIdx + 1}/${cards.length}`}
      />
      <PageContainer>
        <div className="space-y-6">
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

          {flipped && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-center text-muted-foreground">
                你记得多少？
              </p>
              <div className="grid grid-cols-2 gap-2">
                {GRADE_OPTIONS.map(({ grade, label, desc, color }) => (
                  <button
                    key={grade}
                    onClick={() => handleGrade(grade)}
                    disabled={grading}
                    className="flex flex-col items-start rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`size-2 rounded-full ${color}`} />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
