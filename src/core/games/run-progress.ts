/**
 * Plan22 SPEC-P222 — combo and running score for a game run.
 *
 * The reference vocabulary app rewards consecutive correct answers with a
 * combo and a points total, and computes both in the browser. ListenAI cannot:
 * every answer here is marked on the server, so the streak must be derived from
 * what the server already stored — `correct` and `score` on each round — and
 * handed to the client as a number to display, never one to compute.
 *
 * Nothing new is persisted. The rounds of a run already hold everything this
 * needs.
 */

export interface RoundOutcome {
  position: number;
  correct: boolean | null;
  score: number | null;
}

export interface RunProgress {
  answered: number;
  total: number;
  correct: number;
  /** Consecutive correct answers ending at the most recent one. */
  streak: number;
  /** The longest such run anywhere in this game. */
  bestStreak: number;
  /** Points so far: the sum of the server's own round scores. */
  totalScore: number;
}

/**
 * Summarise a run from its rounds.
 *
 * Rounds are read in `position` order rather than the order they arrive, so a
 * replayed or out-of-order answer cannot inflate a streak. An unanswered round
 * is skipped rather than treated as wrong: a game in progress has not broken
 * anyone's combo yet.
 */
export function summariseRunProgress(rounds: readonly RoundOutcome[]): RunProgress {
  const ordered = [...rounds].sort((a, b) => a.position - b.position);

  let answered = 0;
  let correct = 0;
  let streak = 0;
  let bestStreak = 0;
  let totalScore = 0;

  for (const round of ordered) {
    if (round.correct === null) continue;
    answered += 1;
    totalScore += round.score ?? 0;
    if (round.correct) {
      correct += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  return {
    answered,
    total: ordered.length,
    correct,
    streak,
    bestStreak,
    // Points are shown to a learner, so they are whole numbers.
    totalScore: Math.round(totalScore),
  };
}

/**
 * The shout that goes with a streak, or null when there is nothing to shout
 * about. Two in a row is the first streak worth naming; one is just a correct
 * answer.
 */
export function comboLabelVi(streak: number): string | null {
  if (streak < 2) return null;
  return `Combo x${streak}!`;
}
