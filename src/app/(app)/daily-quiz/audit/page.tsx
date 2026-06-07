"use client";

import { useState, useEffect } from "react";
import { Header, PageContainer } from "@/shared/components/layout";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
  ArrowRight,
  KeyRound,
  BookX,
} from "lucide-react";
import type { AuditEventType, DailyQuizAuditLog } from "@/modules/daily-quiz/daily-quiz.types";

const EVENT_META: Record<AuditEventType, { icon: typeof CheckCircle; color: string; label: string }> = {
  generate_start:      { icon: Play,          color: "text-blue-500",   label: "开始生成" },
  generate_batch_ok:   { icon: CheckCircle,   color: "text-green-500",  label: "批次成功" },
  generate_batch_fail: { icon: XCircle,       color: "text-red-500",    label: "批次失败" },
  generate_fallback:   { icon: AlertTriangle, color: "text-amber-500",  label: "缓存降级" },
  generate_complete:   { icon: CheckCircle,   color: "text-emerald-600", label: "生成完成" },
  continue_start:      { icon: ArrowRight,    color: "text-blue-500",   label: "续批开始" },
  continue_ok:         { icon: CheckCircle,   color: "text-green-500",  label: "续批成功" },
  continue_fail:       { icon: XCircle,       color: "text-red-500",    label: "续批失败" },
  kp_insufficient:     { icon: BookX,         color: "text-orange-500", label: "知识点不足" },
  ai_key_missing:      { icon: KeyRound,      color: "text-red-500",    label: "API Key 缺失" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().slice(0, 10)) return "今天";
  if (dateStr === yesterday.toISOString().slice(0, 10)) return "昨天";

  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export default function AuditPage() {
  const [logs, setLogs] = useState<DailyQuizAuditLog[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/daily-quiz/audit")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLogs(json.data);
        else setError(true);
      })
      .catch(() => setError(true));
  }, []);

  return (
    <>
      <Header title="生成日志" />
      <PageContainer>
        {error && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <p>加载失败</p>
            <button
              onClick={() => { setError(false); window.location.reload(); }}
              className="text-sm text-primary underline"
            >
              重试
            </button>
          </div>
        )}

        {!error && !logs && (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            加载中...
          </div>
        )}

        {logs && logs.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-3xl">📋</p>
            <p>暂无生成日志</p>
            <p className="text-xs">每日练习题目生成后，日志将在此显示</p>
          </div>
        )}

        {logs && logs.length > 0 && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground">
              显示最近 7 天的题目生成日志，超过 7 天自动清理
            </p>

            {logs.map((log) => (
              <DaySection key={log.date} log={log} />
            ))}
          </div>
        )}
      </PageContainer>
    </>
  );
}

function DaySection({ log }: { log: DailyQuizAuditLog }) {
  const hasError = log.entries.some((e) =>
    e.event.includes("fail") || e.event === "ai_key_missing" || e.event === "kp_insufficient",
  );
  const isComplete = log.entries.some((e) => e.event === "generate_complete");

  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{formatDate(log.date)}</h3>
        <StatusBadge hasError={hasError} isComplete={isComplete} />
      </div>

      <div className="relative space-y-0">
        {log.entries.map((entry, i) => {
          const meta = EVENT_META[entry.event];
          const Icon = meta.icon;
          const isLast = i === log.entries.length - 1;

          return (
            <div key={`${entry.timestamp}-${i}`} className="flex gap-3">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className={`flex size-6 shrink-0 items-center justify-center rounded-full bg-muted`}>
                  <Icon className={`size-3.5 ${meta.color}`} />
                </div>
                {!isLast && <div className="w-px flex-1 bg-border" />}
              </div>

              {/* Content */}
              <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {entry.detail}
                </p>
                {(entry.questionCount != null || entry.durationMs != null) && (
                  <div className="mt-1 flex gap-3">
                    {entry.questionCount != null && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                        {entry.questionCount} 题
                      </span>
                    )}
                    {entry.durationMs != null && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {entry.durationMs >= 1000
                          ? `${(entry.durationMs / 1000).toFixed(1)}s`
                          : `${entry.durationMs}ms`}
                      </span>
                    )}
                  </div>
                )}
                {entry.error && (
                  <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-600 dark:bg-red-950/30 dark:text-red-400">
                    {entry.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ hasError, isComplete }: { hasError: boolean; isComplete: boolean }) {
  if (hasError && !isComplete) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">
        生成异常
      </span>
    );
  }
  if (hasError && isComplete) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
        有降级
      </span>
    );
  }
  if (isComplete) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950/50 dark:text-green-400">
        生成成功
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      进行中
    </span>
  );
}
