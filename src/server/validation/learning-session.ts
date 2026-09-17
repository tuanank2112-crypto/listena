import { z } from "zod";

export const LearningSessionModeSchema = z.enum([
  "LESSON_COACH",
  "MISSION",
  "DAILY_QUEST",
]);

export const SessionPhaseSchema = z.enum([
  "BRIEFING",
  "ENCOUNTER",
  "CONSEQUENCE",
  "COMEBACK",
  "BOSS",
  "DEBRIEF",
]);

export const CompletionOutcomeSchema = z.enum(["COMPLETED", "PARTIAL"]);

export const PedagogicalActSchema = z.enum([
  "ASK_GUIDING",
  "CLARIFY",
  "RECAST",
  "RELISTEN",
  "INTERVENTION",
  "CONFIRM",
  "REFLECT",
]);

/**
 * Client-minted identifiers must never collide with the namespaces the server
 * reserves for derived rows: `ai:<turn>`, `event:<event>`, `system:<...>`
 * (Plan13 SPEC-P132 §9).
 */
const RESERVED_CLIENT_ID_PREFIX = /^(?!(?:ai|event|system):)/i;

export const CreateLearningSessionSchema = z.object({
  // This UUID belongs to one explicit learner action. It is intentionally not
  // derived from clientTurnId because session creation has its own replay
  // boundary and may involve an upstream AI call.
  clientStartId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  mode: LearningSessionModeSchema,
  goal: z.string().trim().min(3).max(240).optional(),
  scenarioKey: z.string().trim().min(2).max(80).optional(),
  /**
   * Plan13 SPEC-P131 §3: the learner explicitly chose "start a new session"
   * after an ACTIVE_SESSION_EXISTS answer. The server closes the open session
   * (abandon when it has no evidence, PARTIAL completion otherwise) before
   * creating this one. It is not part of the idempotency payload hash.
   */
  replaceActive: z.boolean().optional(),
});

export const SubmitLearningTurnSchema = z.object({
  clientTurnId: z.string().trim().min(8).max(120).regex(
    RESERVED_CLIENT_ID_PREFIX,
    "clientTurnId must not use a reserved namespace prefix",
  ),
  content: z.string().trim().min(1).max(2000),
  responseTimeMs: z.number().int().min(0).max(30 * 60 * 1000).optional(),
  hintCount: z.number().int().min(0).max(20).default(0),
  replayCount: z.number().int().min(0).max(50).default(0),
  interventionId: z.string().uuid().optional(),
});

export const LearningEventSchema = z.object({
  type: z.enum(["HINT", "REPLAY", "PAUSE", "RESUME", "ABANDON"]),
  value: z.number().int().min(0).max(100).optional(),
  clientEventId: z.string().trim().min(8).max(120).regex(
    RESERVED_CLIENT_ID_PREFIX,
    "clientEventId must not use a reserved namespace prefix",
  ),
});

export const MissionStateSchema = z.object({
  phase: SessionPhaseSchema,
  scenarioKey: z.string(),
  scenarioTitle: z.string(),
  npcName: z.string(),
  npcRole: z.string(),
  learnerGoal: z.string(),
  targetVocabulary: z.array(z.string()).max(12),
  targetGrammar: z.array(z.string()).max(6),
  trust: z.number().int().min(0).max(100),
  evidence: z.number().int().min(0).max(100),
  turnCount: z.number().int().min(0),
  successfulTurns: z.number().int().min(0),
  recoveryCount: z.number().int().min(0),
  maxTurns: z.number().int().min(3).max(20),
  completionOutcome: CompletionOutcomeSchema.optional(),
});

const ChoiceInterventionSchema = z.object({
  type: z.literal("CHOICE"),
  prompt: z.string().min(1).max(500),
  spec: z.object({ options: z.array(z.string()).min(2).max(6) }),
  validator: z.object({ correctIndex: z.number().int().min(0).max(5) }),
});

const ReorderInterventionSchema = z.object({
  type: z.literal("REORDER"),
  prompt: z.string().min(1).max(500),
  spec: z.object({ tokens: z.array(z.string()).min(2).max(20) }),
  validator: z.object({ correctAnswer: z.string().min(1).max(500) }),
});

const TextInterventionSchema = z.object({
  type: z.enum(["RETRY", "USE_IN_SENTENCE", "FILL_BLANK"]),
  prompt: z.string().min(1).max(500),
  spec: z.object({
    placeholder: z.string().max(160).optional(),
    audioText: z.string().max(500).optional(),
  }),
  validator: z.object({
    acceptedAnswers: z.array(z.string().min(1)).min(1).max(12),
  }),
});

export const GeneratedInterventionSchema = z.discriminatedUnion("type", [
  ChoiceInterventionSchema,
  ReorderInterventionSchema,
  TextInterventionSchema,
]).superRefine((intervention, context) => {
  if (intervention.type === "CHOICE" &&
      intervention.validator.correctIndex >= intervention.spec.options.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validator", "correctIndex"],
      message: "Correct choice must refer to an available option",
    });
  }
});

export const TutorTurnOutputSchema = z.object({
  npcReply: z.string().trim().min(1).max(700),
  coachMessage: z.string().trim().max(500).default(""),
  pedagogicalAct: PedagogicalActSchema,
  targetSkill: z.enum(["listening", "vocabulary", "spelling", "grammar", "communication"]),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  detectedError: z.object({
    type: z.string().max(80),
    expected: z.string().max(300),
    actual: z.string().max(300),
    explanationVi: z.string().max(500),
  }).nullable(),
  statePatch: z.object({
    phase: SessionPhaseSchema.optional(),
    trustDelta: z.number().int().min(-30).max(30).default(0),
    evidenceDelta: z.number().int().min(-30).max(30).default(0),
    successfulTurn: z.boolean().default(false),
    recovered: z.boolean().default(false),
  }),
  intervention: GeneratedInterventionSchema.nullable(),
  shouldComplete: z.boolean().default(false),
});

export type CreateLearningSessionInput = z.infer<typeof CreateLearningSessionSchema>;
export type SubmitLearningTurnInput = z.infer<typeof SubmitLearningTurnSchema>;
export type MissionState = z.infer<typeof MissionStateSchema>;
export type CompletionOutcome = z.infer<typeof CompletionOutcomeSchema>;
export type TutorTurnOutput = z.infer<typeof TutorTurnOutputSchema>;
export type GeneratedIntervention = z.infer<typeof GeneratedInterventionSchema>;
