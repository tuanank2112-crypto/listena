export type LearningSessionMode = "LESSON_COACH" | "MISSION" | "DAILY_QUEST";
export type LearningSessionStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type SessionPhase = "BRIEFING" | "ENCOUNTER" | "CONSEQUENCE" | "COMEBACK" | "BOSS" | "DEBRIEF";
export type TurnActor = "LEARNER" | "AI" | "SYSTEM";
export type TurnType = "PROMPT" | "RESPONSE" | "COACH" | "INTERVENTION" | "RESULT" | "REFLECTION";
export type InterventionType = "CHOICE" | "REORDER" | "RETRY" | "USE_IN_SENTENCE" | "FILL_BLANK";

export type NextActionKind = "COACH" | "MISSION" | "QUEST" | "PRACTICE";
export type CompletionOutcome = "COMPLETED" | "PARTIAL";

/**
 * An additive, public recommendation contract shared by API consumers and
 * client components. It intentionally contains only navigation-safe values.
 */
export interface NextAction {
  kind: NextActionKind;
  targetId?: string;
  scenarioKey?: string;
  goal?: string;
  reason: string;
  evidenceRefs: string[];
}

export interface MissionState {
  phase: SessionPhase;
  scenarioKey: string;
  scenarioTitle: string;
  npcName: string;
  npcRole: string;
  learnerGoal: string;
  targetVocabulary: string[];
  targetGrammar: string[];
  trust: number;
  evidence: number;
  turnCount: number;
  successfulTurns: number;
  recoveryCount: number;
  maxTurns: number;
}

export interface SessionTurn {
  id: string;
  sequence: number;
  actor: TurnActor;
  turnType: TurnType;
  content: unknown;
  skillTags: string[];
  createdAt: string;
}

export interface SessionEvidence {
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
  createdAt: string;
}

export interface PublicIntervention {
  id: string;
  sourceTurnId: string | null;
  type: InterventionType;
  prompt: string;
  spec: {
    options?: string[];
    tokens?: string[];
    placeholder?: string;
    audioText?: string;
  };
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  outcome: unknown;
  createdAt: string;
  completedAt: string | null;
}

export interface PublicLearningSession {
  id: string;
  lessonId: string | null;
  mode: LearningSessionMode;
  status: LearningSessionStatus;
  goal: string;
  levelSnapshot: CefrLevel;
  state: MissionState;
  lesson: {
    id: string;
    title: string;
    topic: string;
    cefrLevel: CefrLevel;
    audioUrl: string | null;
  } | null;
  turns: SessionTurn[];
  evidence: SessionEvidence[];
  interventions: PublicIntervention[];
  summary: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionOutcome?: CompletionOutcome;
}

export interface LearningSessionEnvelope {
  session?: PublicLearningSession;
  nextAction?: NextAction | null;
  error?: string;
}

export interface TurnSubmission {
  clientTurnId: string;
  content: string;
  responseTimeMs: number;
  hintCount: number;
  replayCount: number;
  interventionId?: string;
}

export function getPendingIntervention(session: PublicLearningSession | null) {
  if (!session) return null;
  return [...session.interventions].reverse().find((item) => item.status === "PENDING") ?? null;
}

export function extractTurnText(content: unknown) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";

  const value = content as Record<string, unknown>;
  for (const key of ["text", "content", "message", "submittedAnswer", "answer"]) {
    if (typeof value[key] === "string") return value[key] as string;
  }
  return "";
}

export function extractAiMessages(content: unknown) {
  if (typeof content === "string") return { npcReply: content, coachMessage: "" };
  if (!content || typeof content !== "object") return { npcReply: "", coachMessage: "" };

  const value = content as Record<string, unknown>;
  const npcReply = typeof value.npcReply === "string" ? value.npcReply : extractTurnText(content);
  const coachMessage = typeof value.coachMessage === "string" ? value.coachMessage : "";
  return { npcReply, coachMessage };
}
