export type LearningDecisionKind =
  | "RESUME"
  | "CALIBRATE"
  | "COACH"
  | "MISSION"
  | "QUEST"
  | "PRACTICE"
  | "REVIEW"
  | "EMPTY";

export const LEARNING_TIME_BUDGETS = [5, 10, 15, 20] as const;

export type LearningTimeBudgetMinutes = (typeof LEARNING_TIME_BUDGETS)[number];

/**
 * The learner's declared daily time is a planning scope, not promised study
 * time. Keep this mapping server-owned so a browser cannot expand a session's
 * turn budget by changing a request body.
 */
export function turnBudgetForDailyMinutes(value: unknown): number {
  switch (value) {
    case 5:
      return 5;
    case 10:
      return 8;
    case 15:
      return 12;
    case 20:
      return 16;
    default:
      return 8;
  }
}

export type LearningDecisionReasonCode =
  | "ACTIVE_SESSION"
  | "NO_EVIDENCE"
  | "RECURRING_ERROR"
  | "DUE_REVIEW"
  | "SKILL_PRACTICE"
  | "GOAL_PRACTICE"
  | "NO_CONTENT";

export type EvidenceRef = {
  source: "LEARNING" | "ADAPTIVE";
  id: string;
};

export type LearningDecision = {
  kind: LearningDecisionKind;
  targetId?: string;
  scenarioKey?: string;
  goal?: string;
  reasonCode: LearningDecisionReasonCode;
  reasonVi: string;
  evidenceRefs: EvidenceRef[];
  estimatedMinutes: LearningTimeBudgetMinutes;
  decisionVersion: "p08-v1";
};
