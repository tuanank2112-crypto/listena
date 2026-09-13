export const DAILY_MINUTE_OPTIONS = [5, 10, 15, 20] as const;

export type DailyMinutes = (typeof DAILY_MINUTE_OPTIONS)[number];

/** The client-safe contract returned by /api/learner/intent. */
export type LearnerIntentPayload = {
  goal: string | null;
  dailyMinutes: DailyMinutes;
  preferredTopics: string[];
  revision: string | null;
};

export type LearnerIntentDraft = Omit<LearnerIntentPayload, "goal"> & {
  goal: string;
};

type ValidationResult =
  | { ok: true; value: LearnerIntentPayload }
  | { ok: false; field: "goal" | "preferredTopics"; message: string };

export function toLearnerIntentDraft(intent: LearnerIntentPayload): LearnerIntentDraft {
  return {
    ...intent,
    goal: intent.goal ?? "",
    preferredTopics: [...intent.preferredTopics],
  };
}

export function normalizeTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateLearnerIntentDraft(draft: LearnerIntentDraft): ValidationResult {
  const goal = draft.goal.trim();
  if (goal.length > 0 && (goal.length < 3 || goal.length > 240)) {
    return {
      ok: false,
      field: "goal",
      message: "Mục tiêu cần từ 3 đến 240 ký tự, hoặc để trống.",
    };
  }

  if (!DAILY_MINUTE_OPTIONS.includes(draft.dailyMinutes)) {
    return { ok: false, field: "goal", message: "Hãy chọn thời lượng học hợp lệ." };
  }

  if (draft.preferredTopics.length > 8) {
    return { ok: false, field: "preferredTopics", message: "Bạn có thể chọn tối đa 8 chủ đề." };
  }

  const topics = draft.preferredTopics.map(normalizeTopic);
  if (topics.some((topic) => topic.length < 1 || topic.length > 40)) {
    return {
      ok: false,
      field: "preferredTopics",
      message: "Mỗi chủ đề cần từ 1 đến 40 ký tự.",
    };
  }

  const uniqueTopics = new Set(topics.map((topic) => topic.toLocaleLowerCase()));
  if (uniqueTopics.size !== topics.length) {
    return { ok: false, field: "preferredTopics", message: "Mỗi chủ đề chỉ nên xuất hiện một lần." };
  }

  return {
    ok: true,
    value: {
      goal: goal || null,
      dailyMinutes: draft.dailyMinutes,
      preferredTopics: topics,
      revision: draft.revision,
    },
  };
}

export function parseLearnerIntentPayload(value: unknown): LearnerIntentPayload | null {
  if (!isRecord(value)) return null;

  const { goal, dailyMinutes, preferredTopics, revision } = value;
  if ((typeof goal !== "string" && goal !== null) || !isDailyMinutes(dailyMinutes)) return null;
  if (!Array.isArray(preferredTopics) || !preferredTopics.every((topic) => typeof topic === "string")) return null;
  if (typeof revision !== "string" && revision !== null) return null;

  return {
    goal,
    dailyMinutes,
    preferredTopics: [...preferredTopics],
    revision,
  };
}

function isDailyMinutes(value: unknown): value is DailyMinutes {
  return typeof value === "number" && DAILY_MINUTE_OPTIONS.includes(value as DailyMinutes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
