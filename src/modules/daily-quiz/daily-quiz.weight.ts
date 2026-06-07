import { toISODateString } from "@/shared/lib/utils";
import type { ErrorWeightItem } from "./daily-quiz.types";

/**
 * Calculate the selection weight for an error item.
 * Higher weight = more likely to appear in tomorrow's quiz.
 *
 * Formula: errorCount × timeDecay × importanceMultiplier
 */
export function calculateWeight(
  item: ErrorWeightItem,
  efactor?: number,
): number {
  if (item.graduated) {
    return item.errorCount * 0.3;
  }

  const today = toISODateString();
  const daysSinceError = daysBetween(item.lastErrorDate, today);
  const timeDecay = 1 / (1 + daysSinceError * 0.1);
  const importanceMultiplier = getImportanceMultiplier(efactor);

  return item.errorCount * timeDecay * importanceMultiplier;
}

function getImportanceMultiplier(efactor?: number): number {
  if (efactor == null) return 1;
  if (efactor < 1.5) return 2;
  if (efactor < 2.0) return 1.5;
  if (efactor > 2.5) return 0.5;
  return 1;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(0, Math.round(Math.abs(b - a) / 86400000));
}

/**
 * Update an error weight item when user answers incorrectly.
 */
export function incrementError(
  item: ErrorWeightItem,
  efactor?: number,
): ErrorWeightItem {
  const updated: ErrorWeightItem = {
    ...item,
    errorCount: item.errorCount + 1,
    lastErrorDate: toISODateString(),
    consecutiveCorrect: 0,
    graduated: false,
    weight: 0,
  };
  updated.weight = calculateWeight(updated, efactor);
  return updated;
}

/**
 * Update an error weight item when user answers correctly.
 * Graduates the item after 2 consecutive correct answers.
 */
export function incrementCorrect(
  item: ErrorWeightItem,
  efactor?: number,
): ErrorWeightItem {
  const consecutiveCorrect = item.consecutiveCorrect + 1;
  const graduated = consecutiveCorrect >= 2;

  const updated: ErrorWeightItem = {
    ...item,
    consecutiveCorrect,
    graduated,
    weight: 0,
  };
  updated.weight = calculateWeight(updated, efactor);
  return updated;
}

/**
 * Create a new error weight item for a knowledge point.
 */
export function createErrorWeightItem(
  kpId: string,
  kpTitle: string,
  category: string[],
): ErrorWeightItem {
  return {
    kpId,
    kpTitle,
    category,
    errorCount: 1,
    lastErrorDate: toISODateString(),
    consecutiveCorrect: 0,
    graduated: false,
    weight: 1,
  };
}
