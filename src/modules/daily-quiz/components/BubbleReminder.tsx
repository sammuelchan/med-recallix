"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/lib/utils";

const STORAGE_KEY = "dq_reminder";
const MAX_REMINDERS = 6;
const REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const QUIET_HOUR_START = 22;
const QUIET_HOUR_END = 7;

interface ReminderState {
  date: string;
  count: number;
  lastShown: number;
  dismissed: boolean;
}

const MESSAGES = [
  "主人，今天的50道题已经准备好啦~ 趁热做吧！",
  "主人，要不先做10道？只需5分钟~",
  "今天的题目里有你上次的易错点哦，来挑战一下？",
  "坚持每天练习的人，通过率提升30%呢！加油~",
  "最后一次提醒啦~ 主人今天要做练习吗？",
  "好的主人，今天不打扰了。明天继续加油！",
];

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isQuietHour(): boolean {
  const hour = new Date().getHours();
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

function getState(): ReminderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: getToday(), count: 0, lastShown: 0, dismissed: false };
    const state = JSON.parse(raw) as ReminderState;
    if (state.date !== getToday()) {
      return { date: getToday(), count: 0, lastShown: 0, dismissed: false };
    }
    return state;
  } catch {
    return { date: getToday(), count: 0, lastShown: 0, dismissed: false };
  }
}

function saveState(state: ReminderState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function BubbleReminder() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [exiting, setExiting] = useState(false);
  const [quizReady, setQuizReady] = useState(false);
  const generationTriggered = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check quiz status on mount — triggers generation if not yet generated
  useEffect(() => {
    async function checkAndTriggerGeneration() {
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (!json.success) return;

        const { status, result } = json.data;

        // Already completed today — no need to remind
        if (result) {
          const state = getState();
          saveState({ ...state, dismissed: true });
          return;
        }

        // Quiz is ready or partially ready — can show reminder
        if (status === "ready" || status === "partial" || status === "in_progress") {
          setQuizReady(true);
          return;
        }

        // Not generated yet — trigger async generation
        if (!status && !generationTriggered.current) {
          generationTriggered.current = true;
          const genRes = await fetch("/api/daily-quiz", { method: "POST" });
          const genJson = await genRes.json();
          if (genJson.success) {
            // Poll until ready
            pollUntilReady();
          }
        }
      } catch {
        // Network error — don't show reminder
      }
    }

    checkAndTriggerGeneration();
  }, []);

  // Poll until quiz generation is complete
  const pollUntilReady = useCallback(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/daily-quiz");
        const json = await res.json();
        if (json.success && json.data.status) {
          const { status } = json.data;
          if (status === "ready" || status === "partial") {
            setQuizReady(true);
            clearInterval(poll);
          }
        }
      } catch {
        clearInterval(poll);
      }
    }, 5000);

    // Timeout after 2 minutes
    setTimeout(() => clearInterval(poll), 120000);
  }, []);

  const shouldShow = useCallback((): boolean => {
    if (!quizReady) return false;
    if (isQuietHour()) return false;
    const state = getState();
    if (state.dismissed) return false;
    if (state.count >= MAX_REMINDERS) return false;
    const elapsed = Date.now() - state.lastShown;
    if (state.count > 0 && elapsed < REMINDER_INTERVAL_MS) return false;
    return true;
  }, [quizReady]);

  const show = useCallback(() => {
    if (!shouldShow()) return;
    const state = getState();
    setMessage(MESSAGES[Math.min(state.count, MESSAGES.length - 1)]);
    setVisible(true);
    saveState({ ...state, count: state.count + 1, lastShown: Date.now() });
  }, [shouldShow]);

  const hide = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 300);
  }, []);

  const handleStartQuiz = useCallback(() => {
    const state = getState();
    saveState({ ...state, dismissed: true });
    hide();
    router.push("/daily-quiz");
  }, [hide, router]);

  const handleDismiss = useCallback(() => {
    hide();
  }, [hide]);

  // Show bubble after quiz is ready, with initial delay
  useEffect(() => {
    if (!quizReady) return;

    const timer = setTimeout(show, 3000);
    return () => clearTimeout(timer);
  }, [quizReady, show]);

  // Periodic re-check every 60s for re-show after dismissal (respects 10min interval)
  useEffect(() => {
    if (!quizReady) return;

    intervalRef.current = setInterval(() => {
      if (!visible && shouldShow()) {
        show();
      }
    }, 60000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [quizReady, show, shouldShow, visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 left-1/2 z-40 -translate-x-1/2",
        "animate-in slide-in-from-bottom duration-300",
        exiting && "animate-out slide-out-to-bottom duration-300",
      )}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm text-white">
          🎓
        </div>
        <p className="max-w-[200px] text-sm text-gray-700">{message}</p>
        <button
          onClick={handleStartQuiz}
          className="shrink-0 rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600"
        >
          做题
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
