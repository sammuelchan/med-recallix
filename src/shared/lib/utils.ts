/**
 * Shared Utility Functions
 *
 * Small, stateless helpers used across both client and server code.
 * Kept minimal — anything domain-specific belongs in the corresponding module.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { nanoid } from "nanoid";

/** Merge Tailwind CSS class names with conflict resolution (clsx + twMerge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a URL-safe unique ID (nanoid, default 12 chars). */
export function generateId(size = 12): string {
  return nanoid(size);
}

/** Format a date in zh-CN locale (e.g. "2024/01/15"). */
export function formatDate(date: Date | string | number): string {
  return new Date(date).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Extract YYYY-MM-DD from a Date (UTC). Used as KV key suffix for daily episodes. */
export function toISODateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
