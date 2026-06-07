"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  BookX,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { WrongAnswerIndexItem, WrongAnswer } from "@/modules/exam";

export default function WrongAnswersPage() {
  const router = useRouter();
  const [items, setItems] = useState<WrongAnswerIndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<WrongAnswer | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/exam/wrong-answers");
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const categories = useMemo(() => {
    const catSet = new Set<string>();
    items.forEach((item) => {
      if (item.category[0]) catSet.add(item.category[0]);
    });
    return Array.from(catSet);
  }, [items]);

  const filtered = useMemo(() => {
    if (!selectedCategory) return items;
    return items.filter((item) => item.category[0] === selectedCategory);
  }, [items, selectedCategory]);

  const toggleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    setExpandedDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/exam/wrong-answers/${id}`);
      const json = await res.json();
      if (json.success) setExpandedDetail(json.data);
    } catch { /* silent */ }
    setLoadingDetail(false);
  }, [expandedId]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/exam/wrong-answers/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setExpandedDetail(null);
      }
    } catch { /* silent */ }
    setDeleting(null);
  }, [expandedId]);

  const handleClearAll = useCallback(async () => {
    if (!confirm("确定要清空所有错题记录吗？此操作不可恢复。")) return;
    setClearing(true);
    try {
      await fetch("/api/exam/wrong-answers", { method: "DELETE" });
      setItems([]);
      setExpandedId(null);
      setExpandedDetail(null);
    } catch { /* silent */ }
    setClearing(false);
  }, []);

  function scoreColor(score: number) {
    if (score >= 60) return "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30";
    return "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30";
  }

  return (
    <>
      <Header
        title="错题本"
        action={
          <button
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="返回"
          >
            <ArrowLeft className="size-5" />
          </button>
        }
      />
      <PageContainer>
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookX className="size-5 text-orange-500" />
              <span className="text-sm font-medium">
                共 {items.length} 道错题
              </span>
            </div>
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={clearing}
                className="text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3 mr-1" />
                {clearing ? "清空中..." : "清空全部"}
              </Button>
            )}
          </div>

          {/* Category filter */}
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  !selectedCategory
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                全部
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <p className="text-4xl mb-4">🎉</p>
              <p className="font-medium">没有错题记录</p>
              <p className="text-sm mt-1">继续保持，做更多测验巩固知识</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => router.push("/knowledge/exam")}
              >
                去做测验
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id} className="rounded-xl border overflow-hidden">
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="w-full p-4 text-left flex items-start gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium leading-snug line-clamp-2">
                          {item.question}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{item.category.join(" > ")}</span>
                          {item.wrongCount > 1 && (
                            <span className="text-orange-500">
                              错 {item.wrongCount} 次
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", scoreColor(item.overallScore))}>
                          {item.overallScore}分
                        </span>
                        {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
                        {loadingDetail ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : expandedDetail ? (
                          <>
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">你的回答</p>
                              <p className="text-sm whitespace-pre-wrap bg-red-50/50 dark:bg-red-950/20 rounded-lg p-3 border border-red-100 dark:border-red-900/30">
                                {expandedDetail.userAnswer}
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-green-600 dark:text-green-400">参考答案</p>
                              <p className="text-sm whitespace-pre-wrap bg-green-50/50 dark:bg-green-950/20 rounded-lg p-3 border border-green-100 dark:border-green-900/30">
                                {expandedDetail.referenceAnswer}
                              </p>
                            </div>

                            {expandedDetail.evaluation && (
                              <div className="space-y-2">
                                <div className="flex gap-4 text-xs">
                                  <span>相似度: <strong>{expandedDetail.evaluation.similarity}</strong></span>
                                  <span>完整度: <strong>{expandedDetail.evaluation.completeness}</strong></span>
                                  <span>综合: <strong>{expandedDetail.evaluation.overall}</strong></span>
                                </div>
                                {expandedDetail.evaluation.feedback && (
                                  <p className="text-xs text-muted-foreground italic">
                                    {expandedDetail.evaluation.feedback}
                                  </p>
                                )}
                                {expandedDetail.evaluation.missingPoints.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                      <AlertTriangle className="size-3" />
                                      遗漏要点
                                    </p>
                                    <ul className="text-xs text-muted-foreground ml-4 mt-1 list-disc space-y-0.5">
                                      {expandedDetail.evaluation.missingPoints.map((p, i) => (
                                        <li key={i}>{p}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex justify-end pt-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(item.id);
                                }}
                                disabled={deleting === item.id}
                                className="text-xs text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-3 mr-1" />
                                {deleting === item.id ? "删除中..." : "移除"}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            加载失败
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
