import { kvGet, kvPut, kvDelete } from "@/shared/infrastructure/kv";
import { kvKeys } from "@/shared/infrastructure/kv";
import { toISODateString } from "@/shared/lib/utils";
import type {
  AuditLogEntry,
  AuditEventType,
  DailyQuizAuditLog,
} from "./daily-quiz.types";

const AUDIT_RETENTION_DAYS = 7;
const MAX_ENTRIES_PER_DAY = 200;

export const DailyQuizAuditService = {
  async append(
    userId: string,
    event: AuditEventType,
    detail: string,
    extra?: { questionCount?: number; durationMs?: number; error?: string },
  ): Promise<void> {
    const today = toISODateString();
    const key = kvKeys.dailyQuizAudit(userId, today);
    const log = (await kvGet<DailyQuizAuditLog>(key)) ?? {
      userId,
      date: today,
      entries: [],
    };

    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      event,
      detail,
      ...extra,
    };

    log.entries.push(entry);

    if (log.entries.length > MAX_ENTRIES_PER_DAY) {
      log.entries = log.entries.slice(-MAX_ENTRIES_PER_DAY);
    }

    await kvPut(key, log);
  },

  async getRecentLogs(
    userId: string,
    days: number = AUDIT_RETENTION_DAYS,
  ): Promise<DailyQuizAuditLog[]> {
    const logs: DailyQuizAuditLog[] = [];

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toISODateString(d);
      const log = await kvGet<DailyQuizAuditLog>(
        kvKeys.dailyQuizAudit(userId, dateStr),
      );
      if (log) logs.push(log);
    }

    return logs;
  },

  async cleanupExpiredLogs(userId: string): Promise<void> {
    const deletePromises: Promise<void>[] = [];

    for (let i = AUDIT_RETENTION_DAYS + 1; i <= AUDIT_RETENTION_DAYS + 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toISODateString(d);
      deletePromises.push(
        kvDelete(kvKeys.dailyQuizAudit(userId, dateStr)).catch(() => {}),
      );
    }

    await Promise.all(deletePromises);
  },
};
