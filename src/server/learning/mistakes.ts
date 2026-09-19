import "server-only";

import { aggregateRecurringErrors, canonicalErrorType, describeErrorType } from "@/core/learning/error-taxonomy";
import type { AggregatedError } from "@/core/learning/error-taxonomy";
import { findHighlights } from "@/core/learning/text-highlight";

/**
 * Plan21 SPEC-P213 — turning the AI's coaching into a record the learner can
 * read back.
 *
 * Every corrected turn already carries the Coach's Vietnamese explanation. What
 * it does not reliably carry is the learner's wrong words: `detectedError.actual`
 * is whatever the model chose to put there, and production has produced a
 * description — "present tense with incorrect verb form" — where a fragment was
 * expected. Quoting that back at the learner is showing them something they
 * never wrote.
 *
 * So the quote is the learner's own message, taken from the turn they actually
 * sent, and `actual` is used only to point inside it.
 */

export interface MistakeExample {
  /** What the learner sent, verbatim. Empty when the turn cannot be found. */
  learnerText: string;
  /**
   * Fragments of `detectedError.actual` that genuinely occur in `learnerText`.
   * Empty when the model described the mistake instead of quoting it.
   */
  highlights: string[];
  /** What the Coach said about it, in Vietnamese. */
  explanationVi: string;
  sessionGoal: string;
  occurredAt: string;
}

export interface MistakeFamily {
  key: string;
  labelVi: string;
  hintVi: string;
  count: number;
  examples: MistakeExample[];
}

/** A stored turn as this module needs to read it. */
export interface StoredTurn {
  actor: string;
  sessionId: string;
  sequence: number;
  contentJson: string;
  createdAt: Date;
  session: { goal: string };
}

interface ParsedDetectedError {
  type: string;
  actual: string;
  explanationVi: string;
}

/** Longest learner message kept; a whole essay is not a useful quote. */
const MAX_LEARNER_TEXT = 400;

function parseObject(contentJson: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    // A turn whose content will not parse is not a reason to fail the page.
    return null;
  }
  return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
}

function parseDetectedError(contentJson: string): ParsedDetectedError | null {
  const content = parseObject(contentJson);
  if (!content) return null;
  const detected = content.detectedError;
  if (typeof detected !== "object" || detected === null) return null;
  const { type, actual, explanationVi } = detected as Record<string, unknown>;
  if (typeof type !== "string" || typeof explanationVi !== "string") return null;
  return { type, actual: typeof actual === "string" ? actual : "", explanationVi };
}

function parseLearnerMessage(contentJson: string): string {
  const content = parseObject(contentJson);
  const message = content?.message;
  return typeof message === "string" ? message.trim().slice(0, MAX_LEARNER_TEXT) : "";
}

/**
 * Pair every AI correction with the learner turn it answered.
 *
 * Turns arrive newest-first across sessions, so they are grouped per session and
 * walked in sequence order: within a session the learner message that precedes
 * an AI turn is the one that turn is talking about.
 */
function collectExamples(turns: StoredTurn[]): Array<{ key: string; example: MistakeExample }> {
  const bySession = new Map<string, StoredTurn[]>();
  for (const turn of turns) {
    const group = bySession.get(turn.sessionId) ?? [];
    group.push(turn);
    bySession.set(turn.sessionId, group);
  }

  const collected: Array<{ key: string; example: MistakeExample }> = [];
  for (const group of bySession.values()) {
    let lastLearnerText = "";
    for (const turn of [...group].sort((a, b) => a.sequence - b.sequence)) {
      if (turn.actor === "LEARNER") {
        lastLearnerText = parseLearnerMessage(turn.contentJson);
        continue;
      }
      if (turn.actor !== "AI") continue;
      const detected = parseDetectedError(turn.contentJson);
      if (!detected) continue;
      const key = canonicalErrorType(detected.type);
      if (!key) continue;
      collected.push({
        key,
        example: {
          learnerText: lastLearnerText,
          highlights: findHighlights(lastLearnerText, detected.actual),
          explanationVi: detected.explanationVi,
          sessionGoal: turn.session.goal,
          occurredAt: turn.createdAt.toISOString(),
        },
      });
    }
  }
  return collected;
}

/**
 * Build the learner's mistake history.
 *
 * Counts come from learner memory, which is the same source the planner uses,
 * so the page and the next-step suggestion can never tell different stories.
 * Examples come from the turns themselves. A family the learner has examples
 * for but no memory count still appears — memory keeps only the most recent
 * families, and a mistake with evidence on screen is real whether or not it
 * survived that window.
 */
export function buildMistakeHistory(input: {
  recurringErrors: Array<{ errorType: string; count: number; lastEvidenceId: string }>;
  turns: StoredTurn[];
  maxFamilies: number;
  maxExamplesPerFamily: number;
}): MistakeFamily[] {
  const counted = new Map<string, AggregatedError>();
  for (const aggregated of aggregateRecurringErrors(input.recurringErrors)) {
    counted.set(aggregated.key, aggregated);
  }

  const examples = new Map<string, MistakeExample[]>();
  const collected = collectExamples(input.turns)
    .sort((a, b) => b.example.occurredAt.localeCompare(a.example.occurredAt));
  for (const { key, example } of collected) {
    const bucket = examples.get(key) ?? [];
    if (bucket.length < input.maxExamplesPerFamily) {
      bucket.push(example);
      examples.set(key, bucket);
    }
  }

  const keys = new Set([...counted.keys(), ...examples.keys()]);
  return [...keys]
    .map((key) => {
      const family = counted.get(key) ?? describeErrorType(key);
      return {
        key,
        labelVi: family.labelVi,
        hintVi: family.hintVi,
        count: counted.get(key)?.count ?? examples.get(key)?.length ?? 0,
        examples: examples.get(key) ?? [],
      };
    })
    // Most repeated first; a family with examples outranks one with none at the
    // same count, because the learner can actually act on what they can see.
    .sort((a, b) => b.count - a.count
      || b.examples.length - a.examples.length
      || a.key.localeCompare(b.key))
    .slice(0, input.maxFamilies);
}
