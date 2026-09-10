/**
 * Browser-safe contract for adaptive games. It intentionally contains only
 * public prompt data and answer submissions — never vocabulary IDs, validators
 * or a browser-calculated correctness flag.
 */
export type UiGameMode = "quiz" | "match" | "spell";
export type AdaptiveGameMode = "QUIZ" | "MATCH" | "SPELL";

export type PublicGameRoundContent =
  | {
      kind: "quiz";
      prompt: "Chọn nghĩa đúng";
      word: string;
      ipa: string | null;
      options: string[];
      context?: string;
      difficulty: number;
    }
  | {
      kind: "match";
      prompt: "Ghép từ với nghĩa";
      cards: Array<{ token: string; kind: "word" | "meaning"; label: string }>;
      difficulty: number;
    }
  | {
      kind: "spell";
      prompt: "Nghe và viết từ";
      meaning: string;
      audioUrl: string | null;
      difficulty: number;
    };

export interface PublicGameRound {
  id: string;
  position: number;
  content: PublicGameRoundContent;
}

export interface PublicGameRun {
  id: string;
  mode: AdaptiveGameMode;
  targetSkill: string;
  difficulty: number;
  expiresAt: string;
  rounds: PublicGameRound[];
}

export interface PublicGameAnswerResult {
  correct: boolean;
  score: number;
  feedbackVi: string;
  idempotent: boolean;
  nextRound?: PublicGameRound;
}

const modeByUi: Record<UiGameMode, AdaptiveGameMode> = {
  quiz: "QUIZ",
  match: "MATCH",
  spell: "SPELL",
};

export function createGameRunRequest(mode: UiGameMode) {
  return { mode: modeByUi[mode] };
}

export function createGameAnswerRequest(input: {
  roundId: string;
  answer: string | string[];
  clientAnswerId: string;
  responseTimeMs: number;
}) {
  return {
    roundId: input.roundId,
    answer: input.answer,
    clientAnswerId: input.clientAnswerId,
    responseTimeMs: Math.min(600_000, Math.max(0, Math.round(input.responseTimeMs))),
  };
}

export function friendlyGameApiError(
  status: number,
  value: unknown,
  retryAfterHeader?: string | null,
) {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const message = typeof payload.message === "string" ? payload.message : "";
  const error = typeof payload.error === "string" ? payload.error : "";
  const payloadRetryAfter = typeof payload.retryAfterSeconds === "number"
    ? payload.retryAfterSeconds
    : Number.NaN;
  const headerRetryAfter = Number(retryAfterHeader);
  const retryAfterSeconds = Number.isFinite(payloadRetryAfter) && payloadRetryAfter > 0
    ? Math.ceil(payloadRetryAfter)
    : Number.isFinite(headerRetryAfter) && headerRetryAfter > 0
      ? Math.ceil(headerRetryAfter)
      : null;

  if (status === 410 || error === "GAME_SESSION_RETIRED") {
    return "Phiên game cũ đã ngừng hoạt động. Hãy bắt đầu một lượt game mới.";
  }
  if (status === 429 || error === "GAME_RATE_LIMIT") {
    return retryAfterSeconds
      ? `${message || "Bạn đang tạo lượt game quá nhanh."} Thử lại sau ${formatGameRetryAfter(retryAfterSeconds)}.`
      : message || "Bạn đang tạo lượt game quá nhanh. Hãy thử lại sau.";
  }
  if (status === 409 || error === "GAME_CONFLICT") {
    return message || "Lượt game này đã hết hạn hoặc đã thay đổi. Hãy tạo lượt mới.";
  }
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
  return message || "Chưa thể kết nối máy chủ chấm game. Hãy thử lại.";
}

function formatGameRetryAfter(seconds: number) {
  if (seconds < 60) return `${seconds} giây`;
  return `${Math.ceil(seconds / 60)} phút`;
}
