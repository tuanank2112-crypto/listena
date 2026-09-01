import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
import { evaluateInterventionAnswer, splitIntervention } from "@/server/learning/intervention";
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
import type {
  CreateLearningSessionInput,
  SubmitLearningTurnInput,
  TutorTurnOutput,
} from "@/server/validation/learning-session";

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

  const [lesson, learner] = await Promise.all([
    input.lessonId ? repository.findLessonForStart(input.lessonId) : null,
    repository.findLearnerContext(userId),
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

  const learnerContext = makeLearnerContext(learner);
  const lessonContext = makeLessonContext(lesson);
  const generated = await startMission({
    mode: input.mode,
    scenarioKey: input.scenarioKey,
    goal: input.goal,
    learnerKey: userId,
    learnerContext,
    lessonContext,
  });
  const sessionId = randomUUID();
  const openingClientTurnId = `opening:${sessionId}`;
  const publicOpening = toPublicTutorContent(generated.opening);

  await repository.transaction(async (tx) => {
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
  const learnerContext = await repository.findLearnerContext(userId);
  if (!learnerContext) throw new LearningSessionNotFoundError();
  const currentState = parseMissionState(snapshot.stateJson);
  const generated = await evaluateTutorTurn({
    state: currentState,
    learnerMessage: input.content,
    recentTurns: makeRecentTurns(snapshot),
    learnerContext: makeLearnerContext(learnerContext),
    lessonContext: makeLessonContext(snapshot.lesson),
  });
  const nextState = applyTutorTurn(currentState, generated.output);

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
          skillTags: generated.output.targetSkill,
        },
      });
      const aiTurn = await tx.learningTurn.create({
        data: {
          sessionId,
          sequence: learnerSequence + 1,
          clientTurnId: getAiClientTurnId(input.clientTurnId),
          actor: "AI",
          turnType: generated.output.intervention ? "INTERVENTION" : "COACH",
          contentJson: JSON.stringify(toPublicTutorContent(generated.output)),
          skillTags: generated.output.targetSkill,
        },
      });

      const evidenceScore = interventionEvaluation
        ? interventionEvaluation.correct
          ? Math.max(0.8, generated.output.score)
          : Math.min(0.4, generated.output.score)
        : generated.output.score;
      await tx.learningEvidence.create({
        data: {
          sessionId,
          turnId: learnerTurn.id,
          skillKey: generated.output.targetSkill,
          evidenceType: intervention ? "INTERVENTION" : "TUTOR_TURN",
          score: evidenceScore,
          confidence: generated.output.confidence,
          hintCount: input.hintCount,
          replayCount: input.replayCount,
          responseTimeMs: input.responseTimeMs,
        },
      });
      await updateSkillMastery(
        tx,
        userId,
        generated.output.targetSkill,
        evidenceScore,
        generated.output.confidence,
      );

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

      await createIntervention(tx, sessionId, aiTurn.id, generated.output);
      await createAiInteraction(tx, {
        userId,
        sessionId,
        turnId: aiTurn.id,
        purpose: "evaluate_turn",
        input: { state: currentState, learnerMessage: input.content },
        output: generated.output,
        meta: generated.meta,
      });
      await tx.learningSession.update({
        where: { id: sessionId },
        data: {
          stateJson: JSON.stringify(nextState),
          status: generated.output.shouldComplete ? "COMPLETED" : "ACTIVE",
          completedAt: generated.output.shouldComplete ? new Date() : null,
          summary: generated.output.shouldComplete
            ? makeSummary(nextState)
            : undefined,
        },
      });
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

export async function completeLearningSession(userId: string, sessionId: string) {
  await repository.transaction(async (tx) => {
    const owned = await findOwnedSessionInTransaction(tx, userId, sessionId);
    if (!owned) throw new LearningSessionNotFoundError();
    if (owned.status === "COMPLETED") return;
    if (owned.status === "ABANDONED") {
      throw new LearningSessionConflictError("Abandoned sessions cannot be completed");
    }

    const state = parseMissionState(owned.stateJson);
    const completedAt = new Date();
    const studyMinutes = Math.max(
      1,
      Math.min(120, Math.round((completedAt.getTime() - owned.startedAt.getTime()) / 60_000)),
    );
    await tx.learningSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt,
        stateJson: JSON.stringify({ ...state, phase: "DEBRIEF" }),
        summary: makeSummary({ ...state, phase: "DEBRIEF" }),
      },
    });
    await tx.learnerProfile.updateMany({
      where: { userId },
      data: {
        totalStudyMinutes: { increment: studyMinutes },
        lastActivityAt: completedAt,
      },
    });
  });

  return { session: await getOwnedSessionDto(userId, sessionId) };
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

function makeSummary(state: ReturnType<typeof parseMissionState>) {
  return `Completed ${state.successfulTurns}/${state.turnCount} successful turns with ${state.recoveryCount} recoveries.`;
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
