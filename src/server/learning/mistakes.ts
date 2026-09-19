import "server-only";

import { aggregateRecurringErrors, canonicalErrorType, describeErrorType } from "@/core/learning/error-taxonomy";
import type { AggregatedError } from "@/core/learning/error-taxonomy";

/**
 * Plan21 SPEC-P213 — turning the AI's coaching into a record the learner can
 * read back.
 *
 * Every corrected turn already carries what the learner wrote wrong and the
 * Coach's Vietnamese explanation. Until now that lived for one screen and then
 * only the planner ever looked at it again. This module reads it back, grouped
 * by mistake family.
 */

/** One correction, as it was stored on an AI turn. */
export interface MistakeExample {
  /** The learner's own wrong fragment. */
  actual: string;
  /** What the Coach said about it, in Vietnamese. */
  explanationVi: string;
  /** The goal of the session it happened in, for context. */
  sessionGoal: string;
  occurredAt: string;
}

export interface MistakeFamily {
  key: string;
  labelVi: string;
  hintVi: string;
  /** How often learner memory has counted this family. */
  count: number;
  /** The learner's own recent sentences in this family, newest first. */
  examples: MistakeExample[];
}

/** An AI turn as this module needs to read it. */
export interface StoredAiTurn {
  contentJson: string;
  createdAt: Date;
  session: { goal: string };
}

interface ParsedDetectedError {
  type: string;
  actual: string;
  explanationVi: string;
}

function parseDetectedError(contentJson: string): ParsedDetectedError | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    // A turn whose content will not parse is not a reason to fail the page.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const detected = (parsed as { detectedError?: unknown }).detectedError;
  if (typeof detected !== "object" || detected === null) return null;
  const { type, actual, explanationVi } = detected as Record<string, unknown>;
  if (typeof type !== "string" || typeof explanationVi !== "string") return null;
  return {
    type,
    actual: typeof actual === "string" ? actual : "",
    explanationVi,
  };
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
  aiTurns: StoredAiTurn[];
  maxFamilies: number;
  maxExamplesPerFamily: number;
}): MistakeFamily[] {
  const counted = new Map<string, AggregatedError>();
  for (const aggregated of aggregateRecurringErrors(input.recurringErrors)) {
    counted.set(aggregated.key, aggregated);
  }

  const examples = new Map<string, MistakeExample[]>();
  for (const turn of input.aiTurns) {
    const detected = parseDetectedError(turn.contentJson);
    if (!detected) continue;
    const key = canonicalErrorType(detected.type);
    if (!key) continue;
    const bucket = examples.get(key) ?? [];
    if (bucket.length < input.maxExamplesPerFamily) {
      bucket.push({
        actual: detected.actual,
        explanationVi: detected.explanationVi,
        sessionGoal: turn.session.goal,
        occurredAt: turn.createdAt.toISOString(),
      });
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
