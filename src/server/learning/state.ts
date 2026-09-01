import type { TutorTurnOutput } from "@/server/validation/learning-session";
import {
  MissionStateSchema,
  type MissionState,
} from "@/server/validation/learning-session";

const MIN_SCORE = 0;
const MAX_SCORE = 100;

export function parseMissionState(value: string | unknown): MissionState {
  const parsedValue = typeof value === "string" ? JSON.parse(value) : value;
  return MissionStateSchema.parse(parsedValue);
}

export function applyTutorTurn(
  current: MissionState,
  output: TutorTurnOutput,
): MissionState {
  const nextPhase = output.shouldComplete
    ? "DEBRIEF"
    : (output.statePatch.phase ?? current.phase);

  return MissionStateSchema.parse({
    ...current,
    phase: nextPhase,
    trust: clampScore(current.trust + output.statePatch.trustDelta),
    evidence: clampScore(current.evidence + output.statePatch.evidenceDelta),
    turnCount: current.turnCount + 1,
    successfulTurns:
      current.successfulTurns + (output.statePatch.successfulTurn ? 1 : 0),
    recoveryCount: current.recoveryCount + (output.statePatch.recovered ? 1 : 0),
  });
}

export function getAiClientTurnId(clientTurnId: string): string {
  return `ai:${clientTurnId}`;
}

export function getEventClientTurnId(clientEventId: string): string {
  return `event:${clientEventId}`;
}

export function nextTurnSequence(lastSequence: number | null | undefined): number {
  return (lastSequence ?? 0) + 1;
}

function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, value));
}
