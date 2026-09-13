import type { LearningDecision } from "@/server/learning/decision";
import type { PublicLearningSession, TurnSubmission } from "./types";

export type PlayerPhase = "loading" | "ready" | "submitting" | "completing" | "completed" | "fatal-error";

export interface LearningSessionPlayerState {
  phase: PlayerPhase;
  session: PublicLearningSession | null;
  draft: string;
  error: string;
  hintCount: number;
  replayCount: number;
  turnStartedAt: number;
  pendingSubmission: TurnSubmission | null;
  nextAction: LearningDecision | null;
}

export type LearningSessionPlayerAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; session: PublicLearningSession; nextAction: LearningDecision | null; now: number }
  | { type: "LOAD_FAILURE"; error: string }
  | { type: "SET_DRAFT"; value: string }
  | { type: "COUNT_HINT" }
  | { type: "COUNT_REPLAY" }
  | { type: "SUBMIT_START"; submission: TurnSubmission }
  | { type: "SUBMIT_SUCCESS"; session: PublicLearningSession; nextAction: LearningDecision | null; now: number }
  | { type: "SUBMIT_FAILURE"; error: string }
  | { type: "COMPLETE_START" }
  | { type: "COMPLETE_SUCCESS"; session: PublicLearningSession; nextAction: LearningDecision | null }
  | { type: "COMPLETE_FAILURE"; error: string }
  | { type: "CLEAR_ERROR" };

export function createInitialPlayerState(now = Date.now()): LearningSessionPlayerState {
  return {
    phase: "loading",
    session: null,
    draft: "",
    error: "",
    hintCount: 0,
    replayCount: 0,
    turnStartedAt: now,
    pendingSubmission: null,
    nextAction: null,
  };
}

export function learningSessionPlayerReducer(
  state: LearningSessionPlayerState,
  action: LearningSessionPlayerAction,
): LearningSessionPlayerState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, phase: "loading", error: "" };
    case "LOAD_SUCCESS":
      return {
        ...state,
        phase: action.session.status === "COMPLETED" ? "completed" : "ready",
        session: action.session,
        error: "",
        turnStartedAt: action.now,
        nextAction: action.session.status === "COMPLETED" ? action.nextAction : null,
      };
    case "LOAD_FAILURE":
      return { ...state, phase: "fatal-error", error: action.error };
    case "SET_DRAFT":
      return { ...state, draft: action.value, error: "", pendingSubmission: null };
    case "COUNT_HINT":
      return { ...state, hintCount: state.hintCount + 1 };
    case "COUNT_REPLAY":
      return { ...state, replayCount: state.replayCount + 1 };
    case "SUBMIT_START":
      return { ...state, phase: "submitting", error: "", pendingSubmission: action.submission };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        phase: action.session.status === "COMPLETED" ? "completed" : "ready",
        session: action.session,
        draft: "",
        error: "",
        hintCount: 0,
        replayCount: 0,
        turnStartedAt: action.now,
        pendingSubmission: null,
        nextAction: action.session.status === "COMPLETED" ? action.nextAction : null,
      };
    case "SUBMIT_FAILURE":
      return { ...state, phase: "ready", error: action.error };
    case "COMPLETE_START":
      return { ...state, phase: "completing", error: "" };
    case "COMPLETE_SUCCESS":
      return { ...state, phase: "completed", session: action.session, error: "", pendingSubmission: null, nextAction: action.nextAction };
    case "COMPLETE_FAILURE":
      return { ...state, phase: "ready", error: action.error };
    case "CLEAR_ERROR":
      return { ...state, error: "" };
    default:
      return state;
  }
}
