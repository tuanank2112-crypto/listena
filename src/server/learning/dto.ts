import "server-only";

import type {
  CefrLevel,
  InterventionStatus,
  LearningSessionMode,
  LearningSessionStatus,
  LearningTurnActor,
  LearningTurnType,
} from "@prisma/client";
import type {
  InterventionType,
  PublicIntervention,
  PublicLearningSession,
} from "@/features/learning-session/types";
import { parseMissionState } from "@/server/learning/state";

type SessionRecord = {
  id: string;
  lessonId: string | null;
  mode: LearningSessionMode;
  status: LearningSessionStatus;
  goal: string;
  levelSnapshot: CefrLevel;
  stateJson: string;
  summary: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  lesson: {
    id: string;
    title: string;
    topic: string;
    cefrLevel: CefrLevel;
    audioUrl: string | null;
  } | null;
  turns: Array<{
    id: string;
    sequence: number;
    actor: LearningTurnActor;
    turnType: LearningTurnType;
    contentJson: string;
    skillTags: string;
    createdAt: Date;
  }>;
  evidence: Array<{
    id: string;
    turnId: string | null;
    skillKey: string;
    evidenceType: string;
    score: number;
    confidence: number;
    difficulty: number;
    hintCount: number;
    replayCount: number;
    responseTimeMs: number | null;
    createdAt: Date;
  }>;
  interventions: Array<{
    id: string;
    sourceTurnId: string | null;
    type: string;
    prompt: string;
    specJson: string;
    status: InterventionStatus;
    outcomeJson: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>;
};

export type LearningSessionDto = ReturnType<typeof toLearningSessionDto>;

export function toLearningSessionDto(record: SessionRecord) {
  const state = parseMissionState(record.stateJson);
  return {
    id: record.id,
    lessonId: record.lessonId,
    mode: record.mode,
    status: record.status,
    goal: record.goal,
    levelSnapshot: record.levelSnapshot,
    state,
    ...(record.status === "COMPLETED" ? {
      completionOutcome: state.completionOutcome === "COMPLETED" ? "COMPLETED" : "PARTIAL",
    } : {}),
    summary: record.summary,
    lesson: record.lesson,
    turns: record.turns
      .filter((turn) => turn.actor !== "SYSTEM")
      .map((turn) => ({
        id: turn.id,
        sequence: turn.sequence,
        actor: turn.actor,
        turnType: turn.turnType,
        content: parseJsonValue(turn.contentJson),
        skillTags: splitTags(turn.skillTags),
        createdAt: turn.createdAt.toISOString(),
      })),
    evidence: record.evidence.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    interventions: record.interventions.map((item) => ({
      id: item.id,
      sourceTurnId: item.sourceTurnId,
      type: item.type as InterventionType,
      prompt: item.prompt,
      spec: parsePublicInterventionSpec(item.specJson),
      status: item.status,
      outcome: item.outcomeJson ? parseJsonValue(item.outcomeJson) : null,
      createdAt: item.createdAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
    startedAt: record.startedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
  } satisfies PublicLearningSession;
}

export function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parsePublicInterventionSpec(
  value: string,
): PublicIntervention["spec"] {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const spec = parsed as Record<string, unknown>;
  return {
    ...(Array.isArray(spec.options) &&
    spec.options.every((item): item is string => typeof item === "string")
      ? { options: spec.options }
      : {}),
    ...(Array.isArray(spec.tokens) &&
    spec.tokens.every((item): item is string => typeof item === "string")
      ? { tokens: spec.tokens }
      : {}),
    ...(typeof spec.placeholder === "string"
      ? { placeholder: spec.placeholder }
      : {}),
    ...(typeof spec.audioText === "string"
      ? { audioText: spec.audioText }
      : {}),
  };
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
