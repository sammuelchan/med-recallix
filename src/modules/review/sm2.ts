/**
 * SM-2 Algorithm Wrapper
 *
 * Implements spaced repetition scheduling based on the SuperMemo SM-2 algorithm
 * (Wozniak, 1987). Wraps the `supermemo` npm package which handles the core
 * interval/EF calculation.
 *
 * SM-2 grade scale (0–5):
 *   0 = complete blackout     → reset to interval=1
 *   1 = wrong, remembered     → reset to interval=1
 *   2 = wrong, easy recall    → keep interval but lower EF
 *   3 = correct, hard recall  → advance normally
 *   4 = correct, hesitated    → advance normally
 *   5 = perfect recall        → advance with EF boost
 *
 * Key parameters per card:
 *   interval   — days until next review
 *   repetition — consecutive correct answers
 *   efactor    — easiness factor (starts at 2.5, min 1.3)
 */

import { supermemo } from "supermemo";
import type { Card, ReviewGrade } from "./review.types";
import { toISODateString } from "@/shared/lib/utils";

/** Apply SM-2 algorithm to compute next review date and update card state. */
export function calculateNextReview(
  card: Card,
  grade: ReviewGrade,
): Card {
  const result = supermemo(
    {
      interval: card.interval,
      repetition: card.repetition,
      efactor: card.efactor,
    },
    grade,
  );

  const now = new Date();
  const nextDue = new Date(now);
  nextDue.setDate(nextDue.getDate() + result.interval);

  return {
    ...card,
    interval: result.interval,
    repetition: result.repetition,
    efactor: result.efactor,
    dueDate: toISODateString(nextDue),
    lastReviewDate: toISODateString(now),
  };
}

/** Create a new card with default SM-2 initial values (EF=2.5, due today). */
export function createCard(knowledgePointId: string, title: string, id: string): Card {
  return {
    id,
    knowledgePointId,
    title,
    interval: 0,
    repetition: 0,
    efactor: 2.5,
    dueDate: toISODateString(),
  };
}

/** Check if a card is due for review (dueDate <= today). */
export function isDue(card: Card): boolean {
  return card.dueDate <= toISODateString();
}
