import type { CardRating } from "@/core/srs/sm2";

const EASY_RESPONSE_MS = 5_000;
const GOOD_RESPONSE_MS = 15_000;

export function getGameReviewRating(
  correct: boolean,
  responseTimeMs?: number,
): CardRating {
  if (!correct) return "AGAIN";
  if (responseTimeMs === undefined) return "GOOD";
  if (responseTimeMs <= EASY_RESPONSE_MS) return "EASY";
  if (responseTimeMs <= GOOD_RESPONSE_MS) return "GOOD";
  return "HARD";
}
