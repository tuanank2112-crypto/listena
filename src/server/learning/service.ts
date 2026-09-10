import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  d1Boolean,
  d1Timestamp,
  executeNativeD1Batch,
  type D1BatchStatement,
} from "@/lib/d1-batch";
import { getNativeD1Database, prisma } from "@/lib/prisma";
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
  type TutorRuntimeMeta,
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
  findOwnedSessionInTransaction,
  type LearningSessionRecord,
  type LearningSessionSnapshot,
} from "@/server/learning/repository";
import {
  applyTutorTurn,
  getAiClientTurnId,
  getEventClientTurnId,
  nextTurnSequence,
  parseMissionState,
} from "@/server/learning/state";
import {
  appendEvidenceToMemory,
  getLearnerMemory,
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

const repository = new LearningSessionRepository();

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

  if (getNativeD1Database()) {
    await persistLearningSessionStartOnD1({
      sessionId,
      openingClientTurnId,
      userId,
      input,
      lesson,
      learnerContext,
      generated,
      publicOpening,
    });
  } else await repository.transaction(async (tx) => {
    await tx.learningSession.create({
      data: {
        id: sessionId,
        userId,
        lessonId: lesson?.id,
        mode: input.mode,
        goal: generated.state.learnerGoal,
        levelSnapshot: toCefrLevel(learnerContext.cefrLevel),
        stateJson: JSON.stringify(generated.state),
      },
    });
    const openingTurn = await tx.learningTurn.create({
      data: {
        sessionId,
        sequence: 1,
        clientTurnId: openingClientTurnId,
        actor: "AI",
        turnType: "PROMPT",
        contentJson: JSON.stringify(publicOpening),
        skillTags: generated.opening.targetSkill,
      },
    });
    await createIntervention(tx, sessionId, openingTurn.id, generated.opening);
    await createAiInteraction(tx, {
      userId,
      sessionId,
      turnId: openingTurn.id,
      purpose: "start_mission",
      input: { mode: input.mode, scenarioKey: generated.state.scenarioKey },
      output: generated.opening,
      meta: generated.meta,
    });
  });

  return { session: await getOwnedSessionDto(userId, sessionId) };
}

/**
 * Prisma's D1 adapter rejects callback transactions. A mission opening has no
 * read-after-write dependency once IDs are assigned here, so Worker D1 can
 * commit its complete graph in one native, parameterized batch instead.
 */
async function persistLearningSessionStartOnD1(input: {
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
  const createdAt = d1Timestamp(now);
  const openingTurnId = randomUUID();
  const interactionId = randomUUID();
  const intervention = input.generated.opening.intervention
    ? splitIntervention(input.generated.opening.intervention)
    : null;
  const statements: D1BatchStatement[] = [
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
      d1Boolean(true),
      d1Boolean(!input.generated.meta.fallbackReason),
      createdAt,
    ],
  });
  await executeNativeD1Batch(statements);
}

/**
 * The learner turn insert is the native-D1 commit fence. Every following
 * mutation is selected only after that exact UUID exists, so a stale state or
 * duplicate client turn cannot leave evidence/mastery without its turn.
 */
async function persistLearningTurnOnD1(input: {
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
  learnerMemory: LearnerMemory | null;
}): Promise<"committed" | "duplicate"> {
  const now = new Date();
  const timestamp = d1Timestamp(now);
  const learnerTurnId = randomUUID();
  const aiTurnId = randomUUID();
  const evidenceId = randomUUID();
  const aiInteractionId = randomUUID();
  const lastSequence = input.snapshot.turns.at(-1)?.sequence;
  const learnerSequence = nextTurnSequence(lastSequence);
  const existingMastery = await prisma.skillMastery.findUnique({
    where: {
      userId_skillKey: {
        userId: input.userId,
        skillKey: input.output.targetSkill,
      },
    },
    select: { masteryScore: true },
  });
  const currentMastery = existingMastery?.masteryScore ?? 0.5;
  const masteryScore = Math.min(
    1,
    Math.max(
      0,
      currentMastery
        + (input.output.score - currentMastery) * 0.18 * input.output.confidence,
    ),
  );
  const memoryWrite = planLearnerMemoryEvidenceWrite(
    input.userId,
    input.learnerMemory,
    {
      id: evidenceId,
      skillKey: input.output.targetSkill,
      score: input.output.score,
      errorType: input.output.detectedError?.type ?? null,
    },
  );
  const nextIntervention = input.output.intervention
    ? splitIntervention(input.output.intervention)
    : null;
  const requiresPendingIntervention = input.intervention ? [
    `AND EXISTS (
       SELECT 1 FROM "Intervention"
       WHERE "id" = ? AND "sessionId" = ? AND "status" = 'PENDING'
     )`,
    [input.intervention.id, input.sessionId] as string[],
  ] as const : ["", [] as string[]] as const;
  const fenceExists = `EXISTS (SELECT 1 FROM "LearningTurn" WHERE "id" = ?)`;
  const statements: D1BatchStatement[] = [
    {
      sql: `INSERT INTO "LearningTurn"
              ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            SELECT ?, ?, ?, ?, 'LEARNER', ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM "LearningSession"
              WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
                AND "stateJson" = ?
            ) ${requiresPendingIntervention[0]}`,
      values: [
        learnerTurnId,
        input.sessionId,
        learnerSequence,
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
      ],
    },
    {
      sql: `INSERT INTO "LearningTurn"
              ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            SELECT ?, ?, ?, ?, 'AI', ?, ?, ?, ?
            WHERE ${fenceExists}`,
      values: [
        aiTurnId,
        input.sessionId,
        learnerSequence + 1,
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
              "masteryScore" = excluded."masteryScore",
              "evidenceCount" = "SkillMastery"."evidenceCount" + 1,
              "lastUpdatedAt" = excluded."lastUpdatedAt"`,
      values: [
        randomUUID(),
        input.userId,
        input.output.targetSkill,
        masteryScore,
        timestamp,
        learnerTurnId,
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
      d1Boolean(true),
      d1Boolean(!input.generated.meta.fallbackReason),
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
    const result = await executeNativeD1Batch(statements);
    if (result[0]?.meta.changes === 1) return "committed";
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const current = await repository.findOwnedSnapshot(input.userId, input.sessionId);
  if (current?.turns.some((turn) => turn.clientTurnId === input.input.clientTurnId)) {
    return "duplicate";
  }
  throw new LearningSessionConflictError();
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

  if (getNativeD1Database()) {
    const committed = await persistLearningTurnOnD1({
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
      learnerMemory,
    });
    if (committed === "duplicate") {
      return buildTurnResponse(
        await getOwnedSessionRecord(userId, sessionId),
        input.clientTurnId,
        true,
      );
    }
    return buildTurnResponse(
      await getOwnedSessionRecord(userId, sessionId),
      input.clientTurnId,
      false,
    );
  }

  try {
    const duplicate = await repository.transaction(async (tx) => {
      const owned = await findOwnedSessionInTransaction(tx, userId, sessionId);
      if (!owned) throw new LearningSessionNotFoundError();
      const existingTurn = await tx.learningTurn.findUnique({
        where: {
          sessionId_clientTurnId: { sessionId, clientTurnId: input.clientTurnId },
        },
        select: { id: true },
      });
      if (existingTurn) return true;
      if (owned.status !== "ACTIVE") {
        throw new LearningSessionConflictError("Only active sessions accept new turns");
      }
      if (owned.stateJson !== snapshot.stateJson) {
        throw new LearningSessionConflictError();
      }

      const lastTurn = await tx.learningTurn.findFirst({
        where: { sessionId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const learnerSequence = nextTurnSequence(lastTurn?.sequence);
      const learnerTurn = await tx.learningTurn.create({
        data: {
          sessionId,
          sequence: learnerSequence,
          clientTurnId: input.clientTurnId,
          actor: "LEARNER",
          turnType: intervention ? "INTERVENTION" : "RESPONSE",
          contentJson: JSON.stringify({
            message: input.content,
            responseTimeMs: input.responseTimeMs ?? null,
            hintCount: input.hintCount,
            replayCount: input.replayCount,
            interventionId: intervention?.id ?? null,
            interventionCorrect: interventionEvaluation?.correct ?? null,
          }),
          skillTags: output.targetSkill,
        },
      });
      const aiTurn = await tx.learningTurn.create({
        data: {
          sessionId,
          sequence: learnerSequence + 1,
          clientTurnId: getAiClientTurnId(input.clientTurnId),
          actor: "AI",
          turnType: output.intervention ? "INTERVENTION" : "COACH",
          contentJson: JSON.stringify(toPublicTutorContent(output)),
          skillTags: output.targetSkill,
        },
      });

      const evidence = await tx.learningEvidence.create({
        data: {
          sessionId,
          turnId: learnerTurn.id,
          skillKey: output.targetSkill,
          evidenceType: intervention ? "INTERVENTION" : "TUTOR_TURN",
          score: output.score,
          confidence: output.confidence,
          hintCount: input.hintCount,
          replayCount: input.replayCount,
          responseTimeMs: input.responseTimeMs,
        },
      });
      await updateSkillMastery(
        tx,
        userId,
        output.targetSkill,
        output.score,
        output.confidence,
      );
      await appendEvidenceToMemory(tx, userId, {
        id: evidence.id,
        skillKey: evidence.skillKey,
        score: evidence.score,
        errorType: output.detectedError?.type ?? null,
      });

      if (intervention && interventionEvaluation) {
        const completed = await tx.intervention.updateMany({
          where: { id: intervention.id, sessionId, status: "PENDING" },
          data: {
            status: "COMPLETED",
            outcomeJson: JSON.stringify(interventionEvaluation),
            completedAt: new Date(),
          },
        });
        if (completed.count !== 1) {
          throw new LearningSessionConflictError("Intervention was already completed");
        }
      }

      await createIntervention(tx, sessionId, aiTurn.id, output);
      await createAiInteraction(tx, {
        userId,
        sessionId,
        turnId: aiTurn.id,
        purpose: "evaluate_turn",
        input: { state: currentState, learnerMessage: input.content },
        output,
        meta: generated.meta,
      });
      if (output.shouldComplete) {
        await finalizeLearningSession(tx, owned, nextState, "COMPLETED");
      } else {
        await tx.learningSession.update({
          where: { id: sessionId },
          data: { stateJson: JSON.stringify(nextState) },
        });
      }
      return false;
    });
    if (duplicate) {
      return buildTurnResponse(
        await getOwnedSessionRecord(userId, sessionId),
        input.clientTurnId,
        true,
      );
    }
  } catch (error) {
    if (isUniqueConflict(error)) {
      const current = await getOwnedSessionRecord(userId, sessionId);
      if (current.turns.some((turn) => turn.clientTurnId === input.clientTurnId)) {
        return buildTurnResponse(current, input.clientTurnId, true);
      }
      throw new LearningSessionConflictError();
    }
    throw error;
  }

  return buildTurnResponse(
    await getOwnedSessionRecord(userId, sessionId),
    input.clientTurnId,
    false,
  );
}

export async function recordLearningEvent(
  userId: string,
  sessionId: string,
  input: LearningEventInput,
) {
  const eventTurnId = getEventClientTurnId(input.clientEventId);
  if (getNativeD1Database()) {
    await persistLearningEventOnD1({ userId, sessionId, input, eventTurnId });
    return { session: await getOwnedSessionDto(userId, sessionId) };
  }
  try {
    await repository.transaction(async (tx) => {
      const owned = await findOwnedSessionInTransaction(tx, userId, sessionId);
      if (!owned) throw new LearningSessionNotFoundError();
      const existing = await tx.learningTurn.findUnique({
        where: {
          sessionId_clientTurnId: { sessionId, clientTurnId: eventTurnId },
        },
        select: { id: true },
      });
      if (existing) return;
      if (owned.status !== "ACTIVE" && input.type !== "ABANDON") {
        throw new LearningSessionConflictError("Only active sessions accept events");
      }

      const lastTurn = await tx.learningTurn.findFirst({
        where: { sessionId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      await tx.learningTurn.create({
        data: {
          sessionId,
          sequence: nextTurnSequence(lastTurn?.sequence),
          clientTurnId: eventTurnId,
          actor: "SYSTEM",
          turnType: "RESULT",
          contentJson: JSON.stringify({ event: input.type, value: input.value ?? 1 }),
        },
      });
      if (input.type === "ABANDON" && owned.status === "ACTIVE") {
        await tx.learningSession.update({
          where: { id: sessionId },
          data: { status: "ABANDONED" },
        });
      }
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const current = await repository.findOwnedSnapshot(userId, sessionId);
    if (!current?.turns.some((turn) => turn.clientTurnId === eventTurnId)) {
      throw new LearningSessionConflictError();
    }
  }

  return { session: await getOwnedSessionDto(userId, sessionId) };
}

async function persistLearningEventOnD1(input: {
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
  const timestamp = d1Timestamp(now);
  const eventId = randomUUID();
  const requiredStatus = input.input.type === "ABANDON" ? snapshot.status : "ACTIVE";
  const statements: D1BatchStatement[] = [
    {
      sql: `INSERT INTO "LearningTurn"
              ("id", "sessionId", "sequence", "clientTurnId", "actor", "turnType", "contentJson", "skillTags", "createdAt")
            SELECT ?, ?, ?, ?, 'SYSTEM', 'RESULT', ?, '', ?
            WHERE EXISTS (
              SELECT 1 FROM "LearningSession"
              WHERE "id" = ? AND "userId" = ? AND "status" = ?
            )`,
      values: [
        eventId,
        input.sessionId,
        nextTurnSequence(snapshot.turns.at(-1)?.sequence),
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
    const result = await executeNativeD1Batch(statements);
    if (result[0]?.meta.changes === 1) return;
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }
  const current = await repository.findOwnedSnapshot(input.userId, input.sessionId);
  if (current?.turns.some((turn) => turn.clientTurnId === input.eventTurnId)) return;
  throw new LearningSessionConflictError();
}

export async function completeLearningSession(userId: string, sessionId: string) {
  if (getNativeD1Database()) {
    await completeLearningSessionOnD1(userId, sessionId);
    return { session: await getOwnedSessionDto(userId, sessionId) };
  }
  await repository.transaction(async (tx) => {
    const owned = await findOwnedSessionInTransaction(tx, userId, sessionId);
    if (!owned) throw new LearningSessionNotFoundError();
    if (owned.status === "COMPLETED") return;

    const evidenceCount = await tx.learningEvidence.count({
      where: { sessionId: owned.id },
    });
    if (evidenceCount < 1) {
      throw new LearningSessionConflictError(
        "Complete at least one learner response before ending this session",
      );
    }

    const state = parseMissionState(owned.stateJson);
    await finalizeLearningSession(
      tx,
      owned,
      state,
      state.phase === "DEBRIEF" ? "COMPLETED" : "PARTIAL",
    );
  });

  return { session: await getOwnedSessionDto(userId, sessionId) };
}

async function completeLearningSessionOnD1(userId: string, sessionId: string) {
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
  const timestamp = d1Timestamp(now);
  const studyMinutes = Math.max(
    1,
    Math.min(120, Math.round((now.getTime() - snapshot.startedAt.getTime()) / 60_000)),
  );
  const results = await executeNativeD1Batch([
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
  if (results[1]?.meta.changes !== 1) throw new LearningSessionConflictError();
}

async function finalizeLearningSession(
  tx: Prisma.TransactionClient,
  owned: NonNullable<Awaited<ReturnType<typeof findOwnedSessionInTransaction>>>,
  state: ReturnType<typeof parseMissionState>,
  completionOutcome: CompletionOutcome,
) {
  if (owned.status === "COMPLETED") return;
  if (owned.status === "ABANDONED") {
    throw new LearningSessionConflictError("Abandoned sessions cannot be completed");
  }
  const completedAt = new Date();
  const studyMinutes = Math.max(
    1,
    Math.min(120, Math.round((completedAt.getTime() - owned.startedAt.getTime()) / 60_000)),
  );
  const completedState = {
    ...state,
    phase: "DEBRIEF" as const,
    completionOutcome,
  };
  const transition = await tx.learningSession.updateMany({
    where: { id: owned.id, userId: owned.userId, status: "ACTIVE" },
    data: {
      status: "COMPLETED",
      completedAt,
      stateJson: JSON.stringify(completedState),
      summary: makeSummary(completedState, completionOutcome),
    },
  });
  if (transition.count !== 1) throw new LearningSessionConflictError();
  await tx.learnerProfile.updateMany({
    where: { userId: owned.userId },
    data: {
      totalStudyMinutes: { increment: studyMinutes },
      lastActivityAt: completedAt,
    },
  });
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

async function createIntervention(
  tx: Prisma.TransactionClient,
  sessionId: string,
  sourceTurnId: string,
  output: TutorTurnOutput,
) {
  if (!output.intervention) return null;
  const intervention = splitIntervention(output.intervention);
  return tx.intervention.create({
    data: {
      sessionId,
      sourceTurnId,
      type: intervention.public.type,
      prompt: intervention.public.prompt,
      specJson: JSON.stringify(intervention.public.spec),
      validatorJson: JSON.stringify(intervention.validator),
    },
  });
}

async function createAiInteraction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    sessionId: string;
    turnId: string;
    purpose: string;
    input: unknown;
    output: TutorTurnOutput;
    meta: TutorRuntimeMeta;
  },
) {
  const serializedInput = JSON.stringify(input.input);
  await tx.aIInteraction.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      purpose: input.purpose,
      provider: input.meta.provider,
      model: input.meta.model,
      promptVersion: input.meta.promptVersion,
      inputHash: createHash("sha256").update(serializedInput).digest("hex"),
      validatedOutput: JSON.stringify(input.output),
      fallbackReason: input.meta.fallbackReason,
      schemaValid: true,
      success: !input.meta.fallbackReason,
    },
  });
}

async function updateSkillMastery(
  tx: Prisma.TransactionClient,
  userId: string,
  skillKey: string,
  score: number,
  confidence: number,
) {
  const existing = await tx.skillMastery.findUnique({
    where: { userId_skillKey: { userId, skillKey } },
  });
  const current = existing?.masteryScore ?? 0.5;
  const learningRate = 0.18 * confidence;
  const masteryScore = Math.min(1, Math.max(0, current + (score - current) * learningRate));
  await tx.skillMastery.upsert({
    where: { userId_skillKey: { userId, skillKey } },
    create: { userId, skillKey, masteryScore, evidenceCount: 1 },
    update: {
      masteryScore,
      evidenceCount: { increment: 1 },
      lastUpdatedAt: new Date(),
    },
  });
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
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  // D1 batch errors do not use Prisma's P2002 class. Retried browser writes
  // can reach the native path concurrently, so map SQLite's explicit unique
  // constraint diagnostics to the same idempotency reconciliation branch.
  const message = error instanceof Error ? error.message : String(error);
  return /(?:UNIQUE constraint failed|SQLITE_CONSTRAINT(?:_UNIQUE)?)/i.test(message);
}
