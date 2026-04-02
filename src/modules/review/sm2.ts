import { supermemo } from "supermemo";
import type { Card, ReviewGrade } from "./review.types";
import { toISODateString } from "@/shared/lib/utils";

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

export function isDue(card: Card): boolean {
  return card.dueDate <= toISODateString();
}
