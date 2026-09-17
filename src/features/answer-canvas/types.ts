import type { ReactNode } from "react";

/**
 * Answer Canvas contracts (SPEC-P133). The component never fetches; the host
 * page injects `fetchAssist` so the same canvas serves legacy lessons
 * (`POST /api/attempt/assist`) and personalized lessons
 * (`POST /api/learner/personalized-lessons/{id}/assist`).
 */

export type AssistMode = "SKELETON" | "TILES";
export type CanvasMode = "FREE" | "SKELETON" | "TILES";
export type Confidence = 1 | 2 | 3;

export interface SkeletonSlot {
  length: number;
  first?: string;
}

export interface AssistPayload {
  mode: AssistMode;
  hintCost: number;
  skeleton?: SkeletonSlot[];
  skeletonText?: string;
  tiles?: string[];
}

export interface CanvasSubmission {
  /** The single `submittedAnswer` string every mode composes. */
  answer: string;
  /** Sum of `hintCost` paid inside the canvas (host adds its own hint clicks). */
  hintCount: number;
  confidence: Confidence | null;
  assistMode: CanvasMode;
}

export interface AnswerCanvasProps {
  /** Changing this key resets all canvas state (new exercise). */
  exerciseKey: string;
  hasAudio: boolean;
  /** False for open answers: hides SKELETON/TILES entirely. */
  allowAssist: boolean;
  fetchAssist: (mode: AssistMode) => Promise<AssistPayload>;
  onSubmit: (submission: CanvasSubmission) => void | Promise<void>;
  /** Host-owned submitting flag so the button mirrors "Đang chấm…". */
  submitting?: boolean;
  /** Fired when the PREDICT countdown starts/stops so the host can hide playback. */
  onPredictingChange?: (predicting: boolean) => void;
  /** Optional secondary action rendered beside the submit button (e.g. "Tiếp"). */
  secondaryAction?: ReactNode;
}

/** Thrown by a host `fetchAssist` so the canvas can react to typed server codes. */
export class AssistRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AssistRequestError";
  }
}

export const PREDICT_WINDOW_MS = 20_000;
