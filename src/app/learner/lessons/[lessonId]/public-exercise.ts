/**
 * Public projection of `Exercise.metadata` for the learner lesson page
 * (Plan13 L2). The importer stores `answers` / `sourceAnswers` alongside the
 * rendering fields; those belong to the server-side grader only and must never
 * be serialized into the RSC payload.
 */

export type PublicExerciseMetadata = {
  content?: string[];
  answerMode?: "open" | "guided";
  unit?: number;
  exerciseNumber?: number;
};

export function toPublicExerciseMetadata(
  metadata: string | Record<string, unknown> | null | undefined,
): PublicExerciseMetadata {
  let parsed: Record<string, unknown> = {};
  if (typeof metadata === "string") {
    try {
      const value: unknown = JSON.parse(metadata);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }
  } else if (metadata && typeof metadata === "object") {
    parsed = metadata;
  }

  // Allow-list only. Anything not copied here (answers, sourceAnswers,
  // correctAnswer, future grader fields) stays on the server.
  const result: PublicExerciseMetadata = {};
  if (Array.isArray(parsed.content)) {
    result.content = parsed.content.filter((line): line is string => typeof line === "string");
  }
  if (parsed.answerMode === "open" || parsed.answerMode === "guided") {
    result.answerMode = parsed.answerMode;
  }
  if (typeof parsed.unit === "number" && Number.isFinite(parsed.unit)) {
    result.unit = parsed.unit;
  }
  if (typeof parsed.exerciseNumber === "number" && Number.isFinite(parsed.exerciseNumber)) {
    result.exerciseNumber = parsed.exerciseNumber;
  }
  return result;
}

/** Serialized form the client component parses; `null` when nothing is public. */
export function toPublicExerciseMetadataJson(
  metadata: string | Record<string, unknown> | null | undefined,
): string | null {
  const projected = toPublicExerciseMetadata(metadata);
  return Object.keys(projected).length > 0 ? JSON.stringify(projected) : null;
}

export type PublicLastAttempt = { score: number | null };

export function toPublicLastAttemptMap(
  attempts: ReadonlyArray<{ exerciseId: string; score: number | null }>,
): Record<string, PublicLastAttempt> {
  return Object.fromEntries(attempts.map((attempt) => [attempt.exerciseId, { score: attempt.score }]));
}
