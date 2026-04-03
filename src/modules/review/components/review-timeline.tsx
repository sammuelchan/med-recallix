"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReviewLog } from "../review.types";

interface RecallData {
  card: {
    id: string;
    interval: number;
    repetition: number;
    efactor: number;
    dueDate: string;
    lastReviewDate?: string;
  } | null;
  reviewHistory: ReviewLog[];
}

const GRADE_LABELS: Record<number, { text: string; color: string }> = {
  0: { text: "完全忘记", color: "text-red-500" },
  1: { text: "有印象", color: "text-red-400" },
  2: { text: "模糊", color: "text-orange-500" },
  3: { text: "勉强记得", color: "text-yellow-600" },
  4: { text: "记得", color: "text-green-500" },
  5: { text: "很熟", color: "text-emerald-600" },
};

export function ReviewTimeline({ kpId }: { kpId: string }) {
  const [data, setData] = useState<RecallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/knowledge/${kpId}/recall`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, [kpId]);

  if (loading) return null;
  if (!data?.card) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        尚未加入复习卡片
      </div>
    );
  }

  const history = data.reviewHistory;
  const showAll = expanded ? history : history.slice(-5);

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">复习回溯</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>已复习 {data.card.repetition} 轮</span>
          <span>间隔 {data.card.interval} 天</span>
        </div>
      </div>

      {/* Current Status */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">下次复习：</span>
        <span>{new Date(data.card.dueDate).toLocaleDateString("zh-CN")}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          E-Factor: {data.card.efactor.toFixed(2)}
        </span>
      </div>

      {/* Timeline */}
      {history.length > 0 ? (
        <div className="relative ml-3 border-l-2 border-muted pl-4 space-y-3">
          {history.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {expanded ? "收起" : `查看全部 ${history.length} 条记录`}
            </button>
          )}
          {showAll.map((log, i) => {
            const grade = GRADE_LABELS[log.grade] ?? { text: `${log.grade}`, color: "text-foreground" };
            return (
              <div key={i} className="relative">
                <div className="absolute -left-[22px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(log.date).toLocaleDateString("zh-CN")}
                  </span>
                  <span className={`font-medium ${grade.color}`}>{grade.text}</span>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground mt-0.5">
                  <span>间隔 {log.interval} 天</span>
                  <span>E-Factor {log.efactor.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          还没有复习记录
        </p>
      )}
    </div>
  );
}
