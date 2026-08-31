import type { GameMode, GameResultItem } from "./types";

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  quiz: "Chọn nhanh",
  match: "Ghép cặp",
  spell: "Nghe & viết",
  scramble: "Xếp chữ",
  cloze: "Điền từ vào câu",
  sprint: "Ai nhanh hơn",
};

export const GAME_MODE_TIME_LIMITS: Record<GameMode, number> = {
  quiz: 60,
  match: 90,
  spell: 75,
  scramble: 75,
  cloze: 90,
  sprint: 45,
};

export interface SessionSummary {
  score: number;
  correctCount: number;
  totalCount: number;
  accuracy: number;
  bestStreak: number;
}

export function summarizeSession(items: GameResultItem[], score: number, bestStreak: number): SessionSummary {
  const correctCount = items.filter((item) => item.correct).length;
  const totalCount = items.length;
  return { score, correctCount, totalCount, accuracy: totalCount ? correctCount / totalCount : 0, bestStreak };
}
