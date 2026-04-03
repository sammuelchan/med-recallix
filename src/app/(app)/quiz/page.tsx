"use client";

import { useState, useEffect } from "react";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { Loader2, Check, X } from "lucide-react";
import type { KPIndexItem } from "@/modules/knowledge";
import type { QuizQuestion } from "@/modules/quiz";

type Phase = "select" | "loading" | "quiz" | "result";

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("select");
  const [kpList, setKpList] = useState<KPIndexItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setKpList(json.data);
      });
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function generateQuiz() {
    if (selected.size === 0) return;
    setError("");
    setPhase("loading");

    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgePointIds: Array.from(selected),
          count: Math.min(selected.size * 2, 10),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setQuestions(json.data);
      setCurrentQ(0);
      setAnswers({});
      setRevealed(false);
      setPhase("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setPhase("select");
    }
  }

  function selectAnswer(questionId: string, option: string) {
    if (revealed) return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  }

  function revealAnswer() {
    setRevealed(true);
  }

  function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ((prev) => prev + 1);
      setRevealed(false);
    } else {
      setPhase("result");
    }
  }

  const score = questions.filter((q) => answers[q.id] === q.answer).length;
  const q = questions[currentQ];

  return (
    <>
      <Header title="AI 出题" />
      <PageContainer>
        {phase === "select" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              选择知识点后 AI 将为你出题
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}

            {kpList.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-4xl mb-4">📝</p>
                <p>先添加知识点才能出题</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {kpList.map((kp) => (
                    <button
                      key={kp.id}
                      onClick={() => toggleSelect(kp.id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selected.has(kp.id)
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <p className="font-medium text-sm">{kp.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {kp.category.join(" / ")}
                      </p>
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full"
                  disabled={selected.size === 0}
                  onClick={generateQuiz}
                >
                  生成题目 ({selected.size} 个知识点)
                </Button>
              </>
            )}
          </div>
        )}

        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-muted-foreground">AI 正在出题...</p>
          </div>
        )}

        {phase === "quiz" && q && (
          <div className="space-y-6">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>第 {currentQ + 1}/{questions.length} 题</span>
            </div>

            <p className="font-medium leading-relaxed">{q.stem}</p>

            <div className="space-y-2">
              {q.options.map((opt) => {
                const isSelected = answers[q.id] === opt.label;
                const isCorrect = opt.label === q.answer;
                let optStyle = "hover:bg-muted/50";
                if (revealed) {
                  if (isCorrect) optStyle = "border-green-500 bg-green-50 dark:bg-green-950/30";
                  else if (isSelected) optStyle = "border-red-500 bg-red-50 dark:bg-red-950/30";
                } else if (isSelected) {
                  optStyle = "border-primary bg-primary/5";
                }

                return (
                  <button
                    key={opt.label}
                    onClick={() => selectAnswer(q.id, opt.label)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors flex gap-3",
                      optStyle,
                    )}
                  >
                    <span className="font-semibold shrink-0 w-6">{opt.label}.</span>
                    <span className="text-sm">{opt.text}</span>
                    {revealed && isCorrect && <Check className="size-4 text-green-500 ml-auto shrink-0 mt-0.5" />}
                    {revealed && isSelected && !isCorrect && <X className="size-4 text-red-500 ml-auto shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {revealed && (
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-sm font-medium mb-1">解析</p>
                <p className="text-sm text-muted-foreground">{q.explanation}</p>
              </div>
            )}

            <div className="flex gap-2">
              {!revealed ? (
                <Button
                  className="w-full"
                  disabled={!answers[q.id]}
                  onClick={revealAnswer}
                >
                  确认答案
                </Button>
              ) : (
                <Button className="w-full" onClick={nextQuestion}>
                  {currentQ + 1 < questions.length ? "下一题" : "查看结果"}
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="text-center space-y-6 py-8">
            <p className="text-5xl">{score === questions.length ? "🏆" : score > questions.length / 2 ? "👍" : "💪"}</p>
            <div>
              <h2 className="text-2xl font-bold">
                {score}/{questions.length}
              </h2>
              <p className="text-muted-foreground mt-1">
                正确率 {Math.round((score / questions.length) * 100)}%
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setPhase("select"); setSelected(new Set()); }}>
                重新选题
              </Button>
              <Button className="flex-1" onClick={generateQuiz}>
                再来一组
              </Button>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
