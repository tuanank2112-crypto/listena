type AttemptHistory = {
  lessonId: string;
  score: number | null;
  createdAt: Date;
};

type SessionHistory = {
  lessonId: string | null;
  status: string;
  updatedAt: Date;
  completedAt: Date | null;
  evidence: Array<{ score: number }>;
};

export function getLessonProgress(
  lessonId: string,
  attempts: AttemptHistory[],
  sessions: SessionHistory[],
) {
  const lessonAttempts = attempts.filter((attempt) => attempt.lessonId === lessonId);
  const lessonSessions = sessions.filter((session) => session.lessonId === lessonId);
  const scores = [
    ...lessonAttempts.flatMap((attempt) =>
      attempt.score === null
        ? []
        : [{ score: attempt.score, occurredAt: attempt.createdAt }],
    ),
    ...lessonSessions.flatMap((session) => {
      if (session.evidence.length === 0) return [];
      const average = session.evidence.reduce((sum, item) => sum + item.score, 0)
        / session.evidence.length;
      return [{
        score: average * 100,
        occurredAt: session.completedAt ?? session.updatedAt,
      }];
    }),
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return {
    completed: lessonAttempts.length > 0
      || lessonSessions.some((session) => session.status === "COMPLETED"),
    isNew: lessonAttempts.length === 0 && lessonSessions.length === 0,
    score: scores[0]?.score ?? 0,
  };
}
