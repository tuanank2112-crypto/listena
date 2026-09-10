import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  libSqlBoolean,
  libSqlTimestamp,
  executeAtomicLibSqlBatch,
  type LibSqlBatchValue,
  type LibSqlBatchStatement,
} from "@/lib/libsql-batch";
import { prisma } from "@/lib/prisma";
import { isAIProviderError } from "@/server/ai/errors";
import {
  reserveUserAICall,
  settleUserAICall,
} from "@/server/ai/request-budget";
import {
  evaluateTutorTurn,
  startMission,
  type LearnerTutorContext,
  type LessonTutorContext,
  type RecentTutorTurn,
} from "@/server/ai/tutor-orchestrator";
import { toLearningSessionDto } from "@/server/learning/dto";
import {
  LearningSessionConflictError,
  LearningSessionNotFoundError,
  LearningSessionValidationError,
} from "@/server/learning/errors";
import { applyInterventionOutcome, evaluateInterventionAnswer, splitIntervention } from "@/server/learning/intervention";
import { toPublicTutorContent } from "@/server/learning/public-content";
import {
  LearningSessionRepository,
  type LearningSessionRecord,
  type LearningSessionSnapshot,
} from "@/server/learning/repository";
import {
  applyTutorTurn,
  getAiClientTurnId,
  getEventClientTurnId,
  parseMissionState,
} from "@/server/learning/state";
import {
  getLearnerMemory,
  parseLearnerMemory,
  planLearnerMemoryEvidenceWrite,
  type LearnerMemory,
} from "@/server/learner-memory/repository";
import type {
  CompletionOutcome,
  CreateLearningSessionInput,
  SubmitLearningTurnInput,
  TutorTurnOutput,
} from "@/server/validation/learning-session";
import { GeneratedInterventionSchema } from "@/server/validation/learning-session";

type LearningEventInput = {
  type: "HINT" | "REPLAY" | "PAUSE" | "RESUME" | "ABANDON";
  value?: number;
  clientEventId: string;
};

type LearnerMemoryWriteSnapshot = {
  memory: LearnerMemory | null;
  fenceSql: string;
  fenceValues: LibSqlBatchValue[];
};

const repository = new LearningSessionRepository();
const MAX_LEARNER_MEMORY_WRITE_ATTEMPTS = 3;

export async function createLearningSession(
  userId: string,
  input: CreateLearningSessionInput,
) {
  if (input.mode === "LESSON_COACH" && !input.lessonId) {
    throw new LearningSessionValidationError(
      "lessonId is required for lesson coach sessions",
      "LESSON_REQUIRED",
    );
  }

  const [lesson, learner, learnerMemory, recentScenarioKeys] = await Promise.all([
    input.lessonId ? repository.findLessonForStart(input.lessonId) : null,
    repository.findLearnerContext(userId),
    getLearnerMemory(userId),
    input.mode === "DAILY_QUEST"
      ? repository.findRecentDailyQuestScenarioKeys(userId)
      : Promise.resolve([]),
  ]);
  if (input.lessonId && !lesson) {
    throw new LearningSessionValidationError(
      "The lesson is unavailable",
      "LESSON_UNAVAILABLE",
    );
  }
  if (!learner) {
    throw new LearningSessionNotFoundError();
  }

  const learnerContext = makeLearnerContext(learner, learnerMemory);
  const lessonContext = makeLessonContext(lesson);
  const sessionId = randomUUID();
  const reservation = await reserveUserAICall({
    userId,
    purpose: "start_mission",
    requestIdentity: sessionId,
  });
  let generated: Awaited<ReturnType<typeof startMission>>;
  try {
    generated = await startMission({
      mode: input.mode,
      scenarioKey: input.scenarioKey,
      goal: input.goal,
      learnerKey: userId,
      learnerContext,
      lessonContext,
      ...(input.mode === "DAILY_QUEST" ? { recentScenarioKeys } : {}),
    });
  } catch (error) {
    await settleUserAICall(reservation, {
      success: false,
      failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
    });
    throw error;
  }
  await settleUserAICall(reservation, {
    success: true,
    provider: generated.meta.provider,
    model: generated.meta.model,
  });
  const openingClientTurnId = `opening:${sessionId}`;
  const publicOpening = toPublicTutorContent(generated.opening);

  await persistLearningSessionStartWithAtomicBatch({
    sessionId,
    openingClientTurnId,
    userId,
    input,
    lesson,
    learnerContext,
    generated,
    publicOpening,
  });

  return { session: await getOwnedSessionDto(userId, sessionId) };
}

/**
 * A mission opening has no read-after-write dependency once IDs are assigned
 * here, so one parameterized libSQL batch can commit its complete graph.
 */
async function persistLearningSessionStartWithAtomicBatch(input: {
  sessionId: string;
  openingClientTurnId: string;
  userId: string;
  input: CreateLearningSessionInput;
  lesson: Awaited<ReturnType<LearningSessionRepository["findLessonForStart"]>>;
  learnerContext: LearnerTutorContext;
  generated: Awaited<ReturnType<typeof startMission>>;
  publicOpening: ReturnType<typeof toPublicTutorContent>;
}) {
  const now = new Date();
  const createdAt = libSqlTimestamp(now);
  const openingTurnId = randomUUID();
  const interactionId = randomUUID();
  const intervention = input.generated.opening.intervention
    ? splitIntervention(input.generated.opening.intervention)
    : null;
  const statements: LibSqlBatchStatement[] = [
    {
      sql: `INSERT INTO "LearningSession"
              ("id", "userId", "lessonId", "mode", "status", "goal", "levelSnapshot", "stateJson", "startedAt", "updatedAt")
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
      values: [
        input.sessionId,
        input.userId,
        input.lesson?.id ?? null,
        input.input.mode,
        input.generated.state.learnerGoal,
        toCefrLevel(input.learnerContext.cefrLevel),
        JSON.stringify(input.generated.state),
        createdAt,
        createdAt,
      ],
    },
    {
      sql: `INSERT INTO "LearningTurn"
              ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            VALUES (?, ?, 1, ?, 'AI', 'PROMPT', ?, ?, ?)`,
      values: [
        openingTurnId,
        input.sessionId,
        input.openingClientTurnId,
        JSON.stringify(input.publicOpening),
        input.generated.opening.targetSkill,
        createdAt,
      ],
    },
  ];
  if (intervention) {
    statements.push({
      sql: `INSERT INTO "Intervention"
              ("id", "sessionId", "sourceTurnId", "type", "prompt", "specJson", "validatorJson", "status", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      values: [
        randomUUID(),
        input.sessionId,
        openingTurnId,
        intervention.public.type,
        intervention.public.prompt,
        JSON.stringify(intervention.public.spec),
        JSON.stringify(intervention.validator),
        createdAt,
      ],
    });
  }
  statements.push({
    sql: `INSERT INTO "AIInteraction"
            ("id", "userId", "sessionId", "turnId", "purpose", "provider", "model", "promptVersion", "inputHash", "validatedOutput", "fallbackReason", "schemaValid", "success", "createdAt")
          VALUES (?, ?, ?, ?, 'start_mission', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      interactionId,
      input.userId,
      input.sessionId,
      openingTurnId,
      input.generated.meta.provider,
      input.generated.meta.model ?? null,
      input.generated.meta.promptVersion,
      createHash("sha256")
        .update(JSON.stringify({ mode: input.input.mode, scenarioKey: input.generated.state.scenarioKey }))
        .digest("hex"),
      JSON.stringify(input.generated.opening),
      input.generated.meta.fallbackReason ?? null,
      libSqlBoolean(true),
      libSqlBoolean(!input.generated.meta.fallbackReason),
      createdAt,
    ],
  });
  await executeAtomicLibSqlBatch(statements);
}

/**
 * The learner turn insert is the atomic batch commit fence. Every following
 * mutation is selected only after that exact UUID exists, so a stale state or
 * duplicate client turn cannot leave evidence/mastery without its turn.
 */
async function persistLearningTurnWithAtomicBatch(input: {
  userId: string;
  sessionId: string;
  input: SubmitLearningTurnInput;
  snapshot: LearningSessionSnapshot;
  currentState: ReturnType<typeof parseMissionState>;
  nextState: ReturnType<typeof applyTutorTurn>;
  output: TutorTurnOutput;
  generated: Awaited<ReturnType<typeof evaluateTutorTurn>>;
  intervention: ReturnType<typeof resolveIntervention>;
  interventionEvaluation: ReturnType<typeof evaluateInterventionAnswer> | null;
  memoryWriteAttempt?: number;
}): Promise<"committed" | "duplicate"> {
  const now = new Date();
  const timestamp = libSqlTimestamp(now);
  const learnerTurnId = randomUUID();
  const aiTurnId = randomUUID();
  const evidenceId = randomUUID();
  const aiInteractionId = randomUUID();
  const masteryRate = 0.18 * input.output.confidence;
  const initialMasteryScore = Math.min(
    1,
    Math.max(0, 0.5 + (input.output.score - 0.5) * masteryRate),
  );
  const nextIntervention = input.output.intervention
    ? splitIntervention(input.output.intervention)
    : null;
  // Re-read the raw aggregate immediately before its guarded batch. A
  // concurrent session that changes any aggregate field makes the first
  // insert a no-op and is retried below with a fresh memory plan.
  const memorySnapshot = await loadLearnerMemoryWriteSnapshot(input.userId);
  const memoryWrite = planLearnerMemoryEvidenceWrite(
    input.userId,
    memorySnapshot.memory,
    {
      id: evidenceId,
      skillKey: input.output.targetSkill,
      score: input.output.score,
      errorType: input.output.detectedError?.type ?? null,
    },
  );
  const requiresPendingIntervention = input.intervention ? [
    `AND EXISTS (
       SELECT 1 FROM "Intervention"
       WHERE "id" = ? AND "sessionId" = ? AND "status" = 'PENDING'
     )`,
    [input.intervention.id, input.sessionId] as string[],
  ] as const : ["", [] as string[]] as const;
  const fenceExists = `EXISTS (SELECT 1 FROM "LearningTurn" WHERE "id" = ?)`;
  const statements: LibSqlBatchStatement[] = [
    {
     sql: `INSERT INTO "LearningTurn"
             ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            SELECT ?, ?, COALESCE((
              SELECT MAX("sequence") + 1 FROM "LearningTurn" WHERE "sessionId" = ?
            ), 1), ?, 'LEARNER', ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM "LearningSession"
             WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
               AND "stateJson" = ?
            ) ${requiresPendingIntervention[0]} ${memorySnapshot.fenceSql}`,
      values: [
        learnerTurnId,
        input.sessionId,
        input.sessionId,
        input.input.clientTurnId,
        input.intervention ? "INTERVENTION" : "RESPONSE",
        JSON.stringify({
          message: input.input.content,
          responseTimeMs: input.input.responseTimeMs ?? null,
          hintCount: input.input.hintCount,
          replayCount: input.input.replayCount,
          interventionId: input.intervention?.id ?? null,
          interventionCorrect: input.interventionEvaluation?.correct ?? null,
        }),
        input.output.targetSkill,
        timestamp,
        input.sessionId,
        input.userId,
        input.snapshot.stateJson,
        ...requiresPendingIntervention[1],
        ...memorySnapshot.fenceValues,
      ],
    },
    {
     sql: `INSERT INTO "LearningTurn"
             ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            SELECT ?, ?, COALESCE((
              SELECT "sequence" + 1 FROM "LearningTurn" WHERE "id" = ?
            ), 1), ?, 'AI', ?, ?, ?, ?
            WHERE ${fenceExists}`,
      values: [
        aiTurnId,
        input.sessionId,
        learnerTurnId,
        getAiClientTurnId(input.input.clientTurnId),
        input.output.intervention ? "INTERVENTION" : "COACH",
        JSON.stringify(toPublicTutorContent(input.output)),
        input.output.targetSkill,
        timestamp,
        learnerTurnId,
      ],
    },
    {
      sql: `INSERT INTO "LearningEvidence"
              ("id", "sessionId", "turnId", "skillKey", "evidenceType", "score", "confidence", "hintCount", "replayCount", "responseTimeMs", "createdAt")
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE ${fenceExists}`,
      values: [
        evidenceId,
        input.sessionId,
        learnerTurnId,
        input.output.targetSkill,
        input.intervention ? "INTERVENTION" : "TUTOR_TURN",
        input.output.score,
        input.output.confidence,
        input.input.hintCount,
        input.input.replayCount,
        input.input.responseTimeMs ?? null,
        timestamp,
        learnerTurnId,
      ],
    },
    {
      sql: `INSERT INTO "SkillMastery"
              ("id", "userId", "skillKey", "masteryScore", "evidenceCount", "lastUpdatedAt")
            SELECT ?, ?, ?, ?, 1, ?
            WHERE ${fenceExists}
            ON CONFLICT("userId", "skillKey") DO UPDATE SET
              "masteryScore" = MIN(1.0, MAX(0.0,
                "SkillMastery"."masteryScore" + (? - "SkillMastery"."masteryScore") * ?
              )),
              "evidenceCount" = "SkillMastery"."evidenceCount" + 1,
              "lastUpdatedAt" = excluded."lastUpdatedAt"`,
      values: [
        randomUUID(),
        input.userId,
        input.output.targetSkill,
        initialMasteryScore,
        timestamp,
        learnerTurnId,
        input.output.score,
        masteryRate,
      ],
    },
    {
      sql: `INSERT INTO "LearnerMemory"
              ("id", "userId", "goalsJson", "errorsJson", "skillsJson", "preferencesJson", "createdAt", "updatedAt")
            SELECT ?, ?, ?, ?, ?, ?, ?, ?
            WHERE ${fenceExists}
            ON CONFLICT("userId") DO UPDATE SET
              "errorsJson" = excluded."errorsJson",
              "skillsJson" = excluded."skillsJson",
              "updatedAt" = excluded."updatedAt"`,
      values: [
        randomUUID(),
        input.userId,
        memoryWrite.create.goalsJson,
        memoryWrite.create.errorsJson,
        memoryWrite.create.skillsJson,
        memoryWrite.create.preferencesJson,
        timestamp,
        timestamp,
        learnerTurnId,
      ],
    },
  ];

  if (input.intervention && input.interventionEvaluation) {
    statements.push({
      sql: `UPDATE "Intervention"
              SET "status" = 'COMPLETED', "outcomeJson" = ?, "completedAt" = ?
            WHERE "id" = ? AND "sessionId" = ? AND "status" = 'PENDING'
              AND ${fenceExists}`,
      values: [
        JSON.stringify(input.interventionEvaluation),
        timestamp,
        input.intervention.id,
        input.sessionId,
        learnerTurnId,
      ],
    });
  }
  if (nextIntervention) {
    statements.push({
      sql: `INSERT INTO "Intervention"
              ("id", "sessionId", "sourceTurnId", "type", "prompt", "specJson", "validatorJson", "status", "createdAt")
            SELECT ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?
            WHERE ${fenceExists}`,
      values: [
        randomUUID(),
        input.sessionId,
        aiTurnId,
        nextIntervention.public.type,
        nextIntervention.public.prompt,
        JSON.stringify(nextIntervention.public.spec),
        JSON.stringify(nextIntervention.validator),
        timestamp,
        learnerTurnId,
      ],
    });
  }
  statements.push({
    sql: `INSERT INTO "AIInteraction"
            ("id", "userId", "sessionId", "turnId", "purpose", "provider", "model", "promptVersion", "inputHash", "validatedOutput", "fallbackReason", "schemaValid", "success", "createdAt")
          SELECT ?, ?, ?, ?, 'evaluate_turn', ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE ${fenceExists}`,
    values: [
      aiInteractionId,
      input.userId,
      input.sessionId,
      aiTurnId,
      input.generated.meta.provider,
      input.generated.meta.model ?? null,
      input.generated.meta.promptVersion,
      createHash("sha256")
        .update(JSON.stringify({ state: input.currentState, learnerMessage: input.input.content }))
        .digest("hex"),
      JSON.stringify(input.output),
      input.generated.meta.fallbackReason ?? null,
      libSqlBoolean(true),
      libSqlBoolean(!input.generated.meta.fallbackReason),
      timestamp,
      learnerTurnId,
    ],
  });

  if (input.output.shouldComplete) {
    const completedState = {
      ...input.nextState,
      phase: "DEBRIEF" as const,
      completionOutcome: "COMPLETED" as const,
    };
    const studyMinutes = Math.max(
      1,
      Math.min(120, Math.round((now.getTime() - input.snapshot.startedAt.getTime()) / 60_000)),
    );
    statements.push(
      {
        sql: `UPDATE "LearningSession"
                SET "status" = 'COMPLETED', "completedAt" = ?, "stateJson" = ?, "summary" = ?, "updatedAt" = ?
              WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
                AND "stateJson" = ? AND ${fenceExists}`,
        values: [
          timestamp,
          JSON.stringify(completedState),
          makeSummary(completedState, "COMPLETED"),
          timestamp,
          input.sessionId,
          input.userId,
          input.snapshot.stateJson,
          learnerTurnId,
        ],
      },
      {
        sql: `UPDATE "LearnerProfile"
                SET "totalStudyMinutes" = "totalStudyMinutes" + ?, "lastActivityAt" = ?, "updatedAt" = ?
              WHERE "userId" = ? AND ${fenceExists}`,
        values: [studyMinutes, timestamp, timestamp, input.userId, learnerTurnId],
      },
    );
  } else {
    statements.push({
      sql: `UPDATE "LearningSession"
              SET "stateJson" = ?, "updatedAt" = ?
            WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
              AND "stateJson" = ? AND ${fenceExists}`,
      values: [
        JSON.stringify(input.nextState),
        timestamp,
        input.sessionId,
        input.userId,
        input.snapshot.stateJson,
        learnerTurnId,
      ],
    });
  }

  try {
    const result = await executeAtomicLibSqlBatch(statements);
    if (result[0]?.changes === 1) return "committed";
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const current = await repository.findOwnedSnapshot(input.userId, input.sessionId);
  if (current?.turns.some((turn) => turn.clientTurnId === input.input.clientTurnId)) {
   return "duplicate";
  }
  const attempt = input.memoryWriteAttempt ?? 0;
  if (
    attempt + 1 < MAX_LEARNER_MEMORY_WRITE_ATTEMPTS
    && current?.status === "ACTIVE"
    && current.stateJson === input.snapshot.stateJson
  ) {
    return persistLearningTurnWithAtomicBatch({
      ...input,
      memoryWriteAttempt: attempt + 1,
    });
  }
  throw new LearningSessionConflictError();
}

async function loadLearnerMemoryWriteSnapshot(
  userId: string,
): Promise<LearnerMemoryWriteSnapshot> {
  const record = await prisma.learnerMemory.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      goalsJson: true,
      errorsJson: true,
      skillsJson: true,
      preferencesJson: true,
    },
  });
  if (!record) {
    return {
      memory: null,
      fenceSql: `AND NOT EXISTS (SELECT 1 FROM "LearnerMemory" WHERE "userId" = ?)`,
      fenceValues: [userId],
    };
  }

  return {
    memory: parseLearnerMemory(record),
    fenceSql: `AND EXISTS (
      SELECT 1 FROM "LearnerMemory"
      WHERE "userId" = ? AND "id" = ?
        AND "goalsJson" = ? AND "errorsJson" = ?
        AND "skillsJson" = ? AND "preferencesJson" = ?
    )`,
    fenceValues: [
      userId,
      record.id,
      record.goalsJson,
      record.errorsJson,
      record.skillsJson,
      record.preferencesJson,
    ],
  };
}

export async function getLearningSession(userId: string, sessionId: string) {
  return { session: await getOwnedSessionDto(userId, sessionId) };
}

export async function submitLearningTurn(
  userId: string,
  sessionId: string,
  input: SubmitLearningTurnInput,
) {
  const snapshot = await repository.findOwnedSnapshot(userId, sessionId);
  if (!snapshot) throw new LearningSessionNotFoundError();

  if (snapshot.turns.some((turn) => turn.clientTurnId === input.clientTurnId)) {
    return buildTurnResponse(
      await getOwnedSessionRecord(userId, sessionId),
      input.clientTurnId,
      true,
    );
  }
  if (snapshot.status !== "ACTIVE") {
    throw new LearningSessionConflictError("Only active sessions accept new turns");
  }

  const intervention = resolveIntervention(snapshot, input.interventionId);
  const interventionEvaluation = intervention
    ? evaluateInterventionAnswer(
        intervention.type,
        intervention.specJson,
        intervention.validatorJson,
        input.content,
      )
    : null;
  const [learnerContext, learnerMemory] = await Promise.all([
    repository.findLearnerContext(userId),
    getLearnerMemory(userId),
  ]);
  if (!learnerContext) throw new LearningSessionNotFoundError();
  const currentState = parseMissionState(snapshot.stateJson);
  const reservation = await reserveUserAICall({
    userId,
    purpose: "evaluate_turn",
    requestIdentity: `${sessionId}:${input.clientTurnId}`,
  });
  let generated: Awaited<ReturnType<typeof evaluateTutorTurn>>;
  try {
    generated = await evaluateTutorTurn({
      state: currentState,
      learnerMessage: input.content,
      learnerKey: userId,
      recentTurns: makeRecentTurns(snapshot),
      learnerContext: makeLearnerContext(learnerContext, learnerMemory),
      lessonContext: makeLessonContext(snapshot.lesson),
    });
  } catch (error) {
    await settleUserAICall(reservation, {
      success: false,
      failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
    });
    throw error;
  }
  await settleUserAICall(reservation, {
    success: true,
    provider: generated.meta.provider,
    model: generated.meta.model,
  });
  const output = intervention && interventionEvaluation
    ? applyInterventionOutcome(
        currentState,
        generated.output,
        interventionEvaluation,
        GeneratedInterventionSchema.parse({
          type: intervention.type,
          prompt: intervention.prompt,
          spec: parseJsonObject(intervention.specJson),
          validator: parseJsonObject(intervention.validatorJson),
        }),
      )
    : generated.output;
  const nextState = applyTutorTurn(currentState, output);

  const committed = await persistLearningTurnWithAtomicBatch({
    userId,
    sessionId,
    input,
    snapshot,
    currentState,
    nextState,
    output,
    generated,
    intervention,
    interventionEvaluation,
  });
  return buildTurnResponse(
    await getOwnedSessionRecord(userId, sessionId),
    input.clientTurnId,
    committed === "duplicate",
  );
}

export async function recordLearningEvent(
  userId: string,
  sessionId: string,
  input: LearningEventInput,
) {
  const eventTurnId = getEventClientTurnId(input.clientEventId);
  await persistLearningEventWithAtomicBatch({ userId, sessionId, input, eventTurnId });

  return { session: await getOwnedSessionDto(userId, sessionId) };
}

async function persistLearningEventWithAtomicBatch(input: {
  userId: string;
  sessionId: string;
  input: LearningEventInput;
  eventTurnId: string;
}) {
  const snapshot = await repository.findOwnedSnapshot(input.userId, input.sessionId);
  if (!snapshot) throw new LearningSessionNotFoundError();
  if (snapshot.turns.some((turn) => turn.clientTurnId === input.eventTurnId)) return;
  if (snapshot.status !== "ACTIVE" && input.input.type !== "ABANDON") {
    throw new LearningSessionConflictError("Only active sessions accept events");
  }
  const now = new Date();
  const timestamp = libSqlTimestamp(now);
  const eventId = randomUUID();
  const requiredStatus = input.input.type === "ABANDON" ? snapshot.status : "ACTIVE";
  const statements: LibSqlBatchStatement[] = [
    {
     sql: `INSERT INTO "LearningTurn"
             ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            SELECT ?, ?, COALESCE((
              SELECT MAX("sequence") + 1 FROM "LearningTurn" WHERE "sessionId" = ?
            ), 1), ?, 'SYSTEM', 'RESULT', ?, '', ?
            WHERE EXISTS (
              SELECT 1 FROM "LearningSession"
              WHERE "id" = ? AND "userId" = ? AND "status" = ?
            )`,
      values: [
        eventId,
        input.sessionId,
        input.sessionId,
        input.eventTurnId,
        JSON.stringify({ event: input.input.type, value: input.input.value ?? 1 }),
        timestamp,
        input.sessionId,
        input.userId,
        requiredStatus,
      ],
    },
  ];
  if (input.input.type === "ABANDON" && snapshot.status === "ACTIVE") {
    statements.push({
      sql: `UPDATE "LearningSession"
              SET "status" = 'ABANDONED', "updatedAt" = ?
            WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
              AND EXISTS (SELECT 1 FROM "LearningTurn" WHERE "id" = ?)`,
      values: [timestamp, input.sessionId, input.userId, eventId],
    });
  }
  try {
    const result = await executeAtomicLibSqlBatch(statements);
    if (result[0]?.changes === 1) return;
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }
  const current = await repository.findOwnedSnapshot(input.userId, input.sessionId);
  if (current?.turns.some((turn) => turn.clientTurnId === input.eventTurnId)) return;
  throw new LearningSessionConflictError();
}

export async function completeLearningSession(userId: string, sessionId: string) {
  await completeLearningSessionWithAtomicBatch(userId, sessionId);
  return { session: await getOwnedSessionDto(userId, sessionId) };
}

async function completeLearningSessionWithAtomicBatch(userId: string, sessionId: string) {
  const snapshot = await repository.findOwnedSnapshot(userId, sessionId);
  if (!snapshot) throw new LearningSessionNotFoundError();
  if (snapshot.status === "COMPLETED") return;
  if (snapshot.status === "ABANDONED") {
    throw new LearningSessionConflictError("Abandoned sessions cannot be completed");
  }
  const evidenceCount = await prisma.learningEvidence.count({ where: { sessionId } });
  if (evidenceCount < 1) {
    throw new LearningSessionConflictError(
      "Complete at least one learner response before ending this session",
    );
  }
  const state = parseMissionState(snapshot.stateJson);
  const completedState = {
    ...state,
    phase: "DEBRIEF" as const,
    completionOutcome: (state.phase === "DEBRIEF" ? "COMPLETED" : "PARTIAL") as CompletionOutcome,
  };
  const now = new Date();
  const timestamp = libSqlTimestamp(now);
  const studyMinutes = Math.max(
    1,
    Math.min(120, Math.round((now.getTime() - snapshot.startedAt.getTime()) / 60_000)),
  );
  const results = await executeAtomicLibSqlBatch([
    {
      sql: `UPDATE "LearnerProfile"
              SET "totalStudyMinutes" = "totalStudyMinutes" + ?, "lastActivityAt" = ?, "updatedAt" = ?
            WHERE "userId" = ? AND EXISTS (
              SELECT 1 FROM "LearningSession"
              WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
                AND "stateJson" = ?
            )`,
      values: [
        studyMinutes,
        timestamp,
        timestamp,
        userId,
        sessionId,
        userId,
        snapshot.stateJson,
      ],
    },
    {
      sql: `UPDATE "LearningSession"
              SET "status" = 'COMPLETED', "completedAt" = ?, "stateJson" = ?, "summary" = ?, "updatedAt" = ?
            WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
              AND "stateJson" = ?`,
      values: [
        timestamp,
        JSON.stringify(completedState),
        makeSummary(completedState, completedState.completionOutcome),
        timestamp,
        sessionId,
        userId,
        snapshot.stateJson,
      ],
    },
  ]);
  if (results[1]?.changes !== 1) throw new LearningSessionConflictError();
}

async function getOwnedSessionRecord(userId: string, sessionId: string) {
  const record = await repository.findOwned(userId, sessionId);
  if (!record) throw new LearningSessionNotFoundError();
  return record;
}

async function getOwnedSessionDto(userId: string, sessionId: string) {
  return toLearningSessionDto(await getOwnedSessionRecord(userId, sessionId));
}

function buildTurnResponse(
  record: LearningSessionRecord,
  clientTurnId: string,
  idempotent: boolean,
) {
  const session = toLearningSessionDto(record);
  const learnerRecord = record.turns.find((turn) => turn.clientTurnId === clientTurnId);
  const aiRecord = record.turns.find(
    (turn) => turn.clientTurnId === getAiClientTurnId(clientTurnId),
  );
  const learnerTurn = session.turns.find((turn) => turn.id === learnerRecord?.id) ?? null;
  const aiTurn = session.turns.find((turn) => turn.id === aiRecord?.id) ?? null;
  const evidence = session.evidence.filter((item) => item.turnId === learnerRecord?.id);
  const intervention =
    session.interventions.find((item) => item.sourceTurnId === aiRecord?.id) ?? null;

  return { session, learnerTurn, aiTurn, evidence, intervention, idempotent };
}

function resolveIntervention(
  snapshot: LearningSessionSnapshot,
  interventionId: string | undefined,
) {
  if (!interventionId) return null;
  const intervention = snapshot.interventions.find((item) => item.id === interventionId);
  if (!intervention) {
    throw new LearningSessionValidationError(
      "Intervention does not belong to this session",
      "INTERVENTION_NOT_FOUND",
    );
  }
  if (intervention.status !== "PENDING") {
    throw new LearningSessionConflictError("Intervention was already completed");
  }
  return intervention;
}

function makeRecentTurns(snapshot: LearningSessionSnapshot): RecentTutorTurn[] {
  return snapshot.turns
    .filter((turn) => turn.actor !== "SYSTEM")
    .slice(-10)
    .flatMap((turn): RecentTutorTurn[] => {
      const parsed = parseJsonObject(turn.contentJson);
      if (turn.actor === "LEARNER") {
        const content = typeof parsed.message === "string" ? parsed.message : "";
        return content ? [{ actor: "LEARNER", content }] : [];
      }
      const npcReply = typeof parsed.npcReply === "string" ? parsed.npcReply : "";
      const coachMessage =
        typeof parsed.coachMessage === "string" ? parsed.coachMessage : "";
      return [
        ...(npcReply ? [{ actor: "AI" as const, content: npcReply }] : []),
        ...(coachMessage ? [{ actor: "COACH" as const, content: coachMessage }] : []),
      ];
    })
    .slice(-10);
}

function makeLearnerContext(
  learner: NonNullable<Awaited<ReturnType<LearningSessionRepository["findLearnerContext"]>>>,
  learnerMemory: LearnerMemory | null,
): LearnerTutorContext {
  const profile = learner.learnerProfile;
  const skillMastery = Object.fromEntries(
    learner.skillMastery
      .filter((item) =>
        ["listening", "vocabulary", "spelling", "grammar", "communication"].includes(
          item.skillKey,
        ),
      )
      .map((item) => [item.skillKey, item.masteryScore]),
  ) as LearnerTutorContext["skillMastery"];

  return {
    cefrLevel: profile?.estimatedCefrLevel ?? "A2",
    preferredTopics: profile?.preferredTopics
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    skillMastery,
    dueVocabulary: learner.dueVocabulary,
    learnerMemory: learnerMemory ?? undefined,
  };
}

function makeLessonContext(
  lesson: LearningSessionSnapshot["lesson"] | Awaited<
    ReturnType<LearningSessionRepository["findLessonForStart"]>
  >,
): LessonTutorContext | undefined {
  if (!lesson) return undefined;
  return {
    title: lesson.title,
    topic: lesson.topic,
    learningObjectives: lesson.learningObjectives
      .split(/\r?\n|[,;]/)
      .map((item) => item.trim())
      .filter(Boolean),
    transcriptExcerpt: lesson.transcript.slice(0, 1_200),
    targetVocabulary: lesson.vocabulary.map(
      ({ vocabularyItem }) => vocabularyItem.displayText,
    ),
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toCefrLevel(value: string | undefined) {
  return (["A1", "A2", "B1", "B2", "C1", "C2"].includes(value ?? "")
    ? value
    : "A2") as "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
}

function makeSummary(
  state: ReturnType<typeof parseMissionState>,
  completionOutcome: CompletionOutcome,
) {
  if (completionOutcome === "PARTIAL") {
    return `Stopped early after ${state.turnCount} turns; continue with the recommended remediation.`;
  }
  return `Completed ${state.successfulTurns}/${state.turnCount} successful turns with ${state.recoveryCount} recoveries.`;
}

function isUniqueConflict(error: unknown) {
  // Retried browser writes can reach the batch concurrently, so map SQLite's
  // explicit *unique* diagnostics to idempotency reconciliation. Other
  // SQLITE_CONSTRAINT variants (for example a trigger abort) must surface as
  // a failed transaction, not be retried and mislabeled as a stale session.
  const message = error instanceof Error ? error.message : String(error);
  return /(?:UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE|SQLITE_CONSTRAINT[^\n]*UNIQUE)/i.test(message);
}
