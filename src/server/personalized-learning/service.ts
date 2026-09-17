import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { CefrLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import {
  libSqlBoolean,
  libSqlTimestamp,
  executeAtomicLibSqlBatch,
  type LibSqlBatchStatement,
} from "@/lib/libsql-batch";
import { MASTERY_INITIAL, MASTERY_MAX, MASTERY_MIN } from "@/core/constants";
import { AIUnavailableError, isAIProviderError } from "@/server/ai/errors";
import {
  createConfiguredStructuredAIProvider,
  type JsonSchema,
  type StructuredAIProvider,
} from "@/server/ai/openai-responses-provider";
import {
  reserveUserAICall,
  settleUserAICall,
  type AICallReservation,
} from "@/server/ai/request-budget";
import { difficultyFromMastery } from "@/server/personalized-learning/calibration";
import {
  buildPersonalizedCalibrationStatement,
  CALIBRATION_RECHECK_INTERVAL_MS,
} from "@/server/personalized-learning/calibration-sql";
import {
  normalizeAnswer,
  normalizeLemma,
  normalizePersonalizedLessonDraft,
  summarizeZodIssues,
  PERSONALIZED_LESSON_JSON_SCHEMA,
  PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS,
  PERSONALIZED_LESSON_TRANSCRIPT_MAX_CHARS,
  PersonalizedLessonContentSchema,
  type PersonalizedLessonDraft,
  PersonalizedLessonDraftSchema,
  type PersonalizedLessonContent,
  PersonalizedLessonValidatorSchema,
  SkillKeySchema,
  type SkillKey,
  toStoredPersonalizedLesson,
} from "@/server/personalized-learning/contracts";
import {
  evaluatePersonalizationBudget,
  PERSONALIZED_LESSON_ACTIVE_WINDOW_MS,
  PERSONALIZED_LESSON_DAILY_LIMIT,
} from "@/server/personalized-learning/generation-budget";

const PROMPT_VERSION = "personalized-lesson-compact-1.1";
/**
 * A GENERATING row is only reclaimable once the request that owns it can no
 * longer be running: 180s provider timeout + 200s route budget headroom. The
 * clock starts at `generationStartedAt` (Plan13 PL1), not `createdAt`.
 */
const GENERATION_STALE_MS = 210_000;
/** Client polling cadence for the async 202 flow (Plan13 SPEC-P131 §4). */
export const PERSONALIZED_GENERATION_POLL_SECONDS = 3;
const TARGET_SKILLS: SkillKey[] = [
  "listening",
  "vocabulary",
  "spelling",
  "grammar",
  "communication",
];
/**
 * Plan13 SPEC-P132 §8: one mastery formula for every AdaptiveEvidence source.
 * `performance = clamp(score / clamp(difficulty, 0.6, 1.8), 0, 1)` and
 * `new = old + alpha * (performance - old)`; personalized lessons use
 * alpha 0.2 (games 0.18). The SQL below mirrors this exactly.
 */
const PERSONALIZED_MASTERY_ALPHA = 0.2;

export class PersonalizedLearningError extends Error {
  constructor(
    readonly code:
      | "PRIVATE_NOT_FOUND"
      | "VALIDATION_ERROR"
      | "AI_RATE_LIMITED"
      | "PERSONALIZATION_LIMIT"
      | "GAME_CONFLICT",
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PersonalizedLearningError";
  }
}

type LearnerSnapshot = {
  targetSkill: SkillKey;
  cefrLevel: CefrLevel;
  difficulty: number;
  calibrationStatus: "UNASSESSED" | "CALIBRATING" | "CALIBRATED";
  preferredTopics: string[];
  skillMastery: Partial<Record<SkillKey, number>>;
  dueVocabulary: Array<{
    lemma: string;
    meaningVi: string;
    cefrLevel: CefrLevel;
  }>;
  curriculumGrounding: Array<{
    lemma: string;
    meaningVi: string;
    cefrLevel: CefrLevel;
  }>;
  recentEvidence: Array<{
    skillKey: string;
    score: number;
    difficulty: number;
  }>;
};

type StoredLessonRow = {
  id: string;
  targetSkill: string;
  cefrLevel: CefrLevel;
  difficulty: number;
  title: string | null;
  objectivesJson: string;
  contentJson: string | null;
  createdAt: Date;
  readyAt: Date | null;
};

export type PublicPersonalizedLesson = {
  id: string;
  status: "READY";
  title: string;
  targetSkill: SkillKey;
  cefrLevel: CefrLevel;
  difficulty: number;
  objectives: string[];
  content: PersonalizedLessonContent;
  createdAt: string;
  readyAt: string | null;
};

/**
 * What `GET /api/learner/personalized-lessons/{id}` returns while a lesson is
 * not READY. It never contains content or answers.
 */
export type PendingPersonalizedLesson = {
  id: string;
  status: "GENERATING" | "FAILED";
  targetSkill: SkillKey;
  failureCode: string | null;
  generationAttempt: number;
  generationStartedAt: string | null;
  createdAt: string;
  retryAfterSeconds: number;
};

export type PersonalizedLessonStatus = PublicPersonalizedLesson | PendingPersonalizedLesson;

/**
 * Result of the claim step of the async generation flow (Plan13 SPEC-P131 §4).
 * `claimed` carries everything `runPersonalizedLessonGeneration` needs so the
 * provider call can run after the 202 response has been sent.
 */
export type PersonalizedGenerationClaim =
  | { kind: "ready"; lesson: PublicPersonalizedLesson }
  | { kind: "in-progress"; lessonId: string; retryAfterSeconds: number }
  | {
      kind: "claimed";
      lessonId: string;
      userId: string;
      generationKey: string;
      sourceSnapshotHash: string;
      snapshot: LearnerSnapshot;
      provider: StructuredAIProvider;
      reservation: AICallReservation;
      retryAfterSeconds: number;
    };

export type PersonalizedGenerationResult =
  | { status: "READY"; lesson: PublicPersonalizedLesson }
  | { status: "FAILED"; failureCode: string };

/**
 * Step 1 of the async flow: create or reclaim the GENERATING row, stamp the
 * generation lease and reserve the learner's AI call. Cheap and synchronous:
 * budget/limit errors surface immediately as typed 429s. No provider call.
 */
export async function claimPersonalizedLessonGeneration(
  userId: string,
  requestedSkill?: SkillKey,
): Promise<PersonalizedGenerationClaim> {
  const snapshot = await buildLearnerSnapshot(userId, requestedSkill);
  const sourceSnapshotHash = hashSnapshot(snapshot);
  const existing = await prisma.personalizedLesson.findUnique({
    where: {
      userId_targetSkill_sourceSnapshotHash: {
        userId,
        targetSkill: snapshot.targetSkill,
        sourceSnapshotHash,
      },
    },
  });

  if (existing?.status === "READY") {
    return { kind: "ready", lesson: toPublicPersonalizedLesson(existing) };
  }
  if (
    existing?.status === "GENERATING"
    && !isStaleGeneration(existing.generationStartedAt ?? existing.createdAt)
  ) {
    return inProgress(existing.id);
  }

  await assertPersonalizationBudget(userId);

  // A fresh private lease prevents a late response from a previous attempt
  // from turning a newer GENERATING row into READY.
  const generationKey = randomUUID();
  const now = new Date();
  let lessonId: string;
  if (existing) {
    // Compare-and-swap on the previous key: a concurrent claim of the same
    // FAILED/stale row loses here and is told to poll instead.
    const reclaimed = await prisma.personalizedLesson.updateMany({
      where: { id: existing.id, generationKey: existing.generationKey },
      data: {
        status: "GENERATING",
        generationKey,
        generationStartedAt: now,
        generationAttempt: { increment: 1 },
        title: null,
        objectivesJson: "[]",
        contentJson: null,
        validatorJson: null,
        provider: null,
        model: null,
        failureCode: null,
        readyAt: null,
      },
    });
    if (reclaimed.count !== 1) return inProgress(existing.id);
    lessonId = existing.id;
  } else {
    try {
      const created = await prisma.personalizedLesson.create({
        data: {
          userId,
          status: "GENERATING",
          targetSkill: snapshot.targetSkill,
          cefrLevel: snapshot.cefrLevel,
          difficulty: snapshot.difficulty,
          sourceSnapshotHash,
          generationKey,
          generationStartedAt: now,
          generationAttempt: 1,
          promptVersion: PROMPT_VERSION,
        },
        select: { id: true },
      });
      lessonId = created.id;
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const concurrent = await prisma.personalizedLesson.findUnique({
        where: {
          userId_targetSkill_sourceSnapshotHash: {
            userId,
            targetSkill: snapshot.targetSkill,
            sourceSnapshotHash,
          },
        },
      });
      if (concurrent?.status === "READY") {
        return { kind: "ready", lesson: toPublicPersonalizedLesson(concurrent) };
      }
      if (concurrent) return inProgress(concurrent.id);
      throw error;
    }
  }

  try {
    const provider = createConfiguredStructuredAIProvider();
    if (!provider) {
      throw new AIUnavailableError({ reason: "provider_not_configured" });
    }
    const reservation = await reserveUserAICall({
      userId,
      purpose: "personalized_lesson",
      requestIdentity: `${lessonId}:${sourceSnapshotHash}:${generationKey}`,
      provider: provider.providerName,
      model: provider.modelName,
    });
    return {
      kind: "claimed",
      lessonId,
      userId,
      generationKey,
      sourceSnapshotHash,
      snapshot,
      provider,
      reservation,
      retryAfterSeconds: PERSONALIZED_GENERATION_POLL_SECONDS,
    };
  } catch (error) {
    await markGenerationFailed(lessonId, generationKey, failureCodeOf(error));
    throw error;
  }
}

/**
 * Step 2 of the async flow: the provider call plus persistence. Runs after the
 * 202 response (`after()` in the route) and therefore never throws: every
 * outcome is written to the row (READY or FAILED) for the client to poll, and
 * the AI reservation is always settled.
 */
export async function runPersonalizedLessonGeneration(
  claim: Extract<PersonalizedGenerationClaim, { kind: "claimed" }>,
): Promise<PersonalizedGenerationResult> {
  const { provider, reservation, snapshot } = claim;
  let settled = false;
  const settle = async (outcome: Parameters<typeof settleUserAICall>[1]) => {
    if (settled) return;
    settled = true;
    await settleUserAICall(reservation, outcome);
  };
  try {
    let response;
    try {
      response = await provider.generateJson<unknown>({
        purpose: "personalized_lesson",
        systemPrompt: [
          "You create a short private English self-study lesson for one Vietnamese learner.",
          "Use only the supplied learner snapshot and verified curriculum grounding.",
          "Make all exercise answers objectively gradable; never ask for private data.",
          "Be compact: 4 to 5 vocabulary items, exactly 4 exercises, a transcript of at most",
          `${PERSONALIZED_LESSON_TRANSCRIPT_MAX_CHARS} characters, and omit optional fields (ipa, meaningEn, partOfSpeech, exampleSentence) unless essential.`,
          "Return exactly the requested schema. Do not describe your reasoning.",
        ].join(" "),
        input: {
          learner: snapshot,
          constraints: {
            requiredTargetSkill: snapshot.targetSkill,
            requiredCefrLevel: snapshot.cefrLevel,
            difficultyBand: [
              Math.max(0.6, snapshot.difficulty - 0.2),
              Math.min(1.8, snapshot.difficulty + 0.2),
            ],
            exerciseCount: "exactly 4",
            vocabularyCount: "4 to 5",
            transcriptMaxChars: PERSONALIZED_LESSON_TRANSCRIPT_MAX_CHARS,
          },
        },
        schemaName: "personalized_lesson",
        schema: PERSONALIZED_LESSON_JSON_SCHEMA as JsonSchema,
        safetyIdentifier: claim.userId,
        maxOutputTokens: PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS,
      });
    } catch (error) {
      await settle({
        success: false,
        provider: provider.providerName,
        model: provider.modelName,
        failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
      });
      throw error;
    }
    // Lenient shape repair first (slice/trim/renumber), then strict Zod.
    const draft = PersonalizedLessonDraftSchema.safeParse(
      normalizePersonalizedLessonDraft(response.output),
    );
    if (
      !draft.success ||
      draft.data.targetSkill !== snapshot.targetSkill ||
      draft.data.cefrLevel !== snapshot.cefrLevel ||
      Math.abs(draft.data.difficulty - snapshot.difficulty) > 0.21
    ) {
      // Paths and codes only: never learner content or answers.
      logger.warn(
        {
          lessonId: claim.lessonId,
          requestId: response.requestId,
          validation: draft.success
            ? `snapshot-mismatch:targetSkill=${draft.data.targetSkill !== snapshot.targetSkill};cefr=${draft.data.cefrLevel !== snapshot.cefrLevel};difficulty=${Math.abs(draft.data.difficulty - snapshot.difficulty) > 0.21}`
            : summarizeZodIssues(draft.error.issues),
        },
        "Personalized lesson draft rejected by validation",
      );
      await settle({
        success: false,
        provider: response.provider,
        model: response.model,
        requestId: response.requestId,
        failureReason: "schema_validation_failed",
      });
      throw new AIUnavailableError({
        reason: "schema_validation_failed",
        provider: response.provider,
        model: response.model,
        requestId: response.requestId,
      });
    }

    await settle({
      success: true,
      provider: response.provider,
      model: response.model,
      requestId: response.requestId,
    });

    const persisted = await persistGeneratedPersonalizedLesson({
      lessonId: claim.lessonId,
      userId: claim.userId,
      sourceSnapshotHash: claim.sourceSnapshotHash,
      draft: draft.data,
      response,
      generationKey: claim.generationKey,
    });
    return { status: "READY", lesson: toPublicPersonalizedLesson(persisted) };
  } catch (error) {
    const failureCode = failureCodeOf(error);
    logger.warn(
      {
        lessonId: claim.lessonId,
        failureCode,
        reason: isAIProviderError(error) ? error.details.reason : undefined,
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "Personalized lesson generation failed",
    );
    await markGenerationFailed(claim.lessonId, claim.generationKey, failureCode);
    return { status: "FAILED", failureCode };
  } finally {
    if (!settled) {
      // Only reachable if persistence threw before settle ran (it cannot), but
      // a leaked PENDING lease would block the learner for 210s, so close it.
      try {
        await settle({ success: false, failureReason: "unknown" });
      } catch {
        // The lease self-expires.
      }
    }
  }
}

function inProgress(lessonId: string): PersonalizedGenerationClaim {
  return {
    kind: "in-progress",
    lessonId,
    retryAfterSeconds: PERSONALIZED_GENERATION_POLL_SECONDS,
  };
}

function failureCodeOf(error: unknown) {
  return isAIProviderError(error) ? error.code : "AI_UNAVAILABLE";
}

async function markGenerationFailed(
  lessonId: string,
  generationKey: string,
  failureCode: string,
) {
  try {
    await prisma.personalizedLesson.updateMany({
      where: { id: lessonId, status: "GENERATING", generationKey },
      data: { status: "FAILED", failureCode },
    });
  } catch (error) {
    // The row stays GENERATING until GENERATION_STALE_MS, after which it is
    // reclaimable; the learner is never blocked beyond one lease.
    logger.warn({ error, lessonId }, "Could not mark personalized lesson FAILED");
  }
}

async function assertPersonalizationBudget(userId: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - PERSONALIZED_LESSON_ACTIVE_WINDOW_MS);
  const [activeGeneration, recentGenerations] = await Promise.all([
    prisma.personalizedLesson.findFirst({
      where: {
        userId,
        status: "GENERATING",
        OR: [
          { generationStartedAt: { gte: windowStart } },
          { generationStartedAt: null, createdAt: { gte: windowStart } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, generationStartedAt: true },
    }),
    prisma.aIInteraction.findMany({
      where: {
        userId,
        purpose: "personalized_lesson",
        success: true,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1_000) },
      },
      orderBy: { createdAt: "desc" },
      take: PERSONALIZED_LESSON_DAILY_LIMIT,
      select: { createdAt: true },
    }),
  ]);
  const decision = evaluatePersonalizationBudget({
    now,
    activeGenerationCreatedAt: activeGeneration
      ? activeGeneration.generationStartedAt ?? activeGeneration.createdAt
      : undefined,
    successfulGenerationTimes: recentGenerations.map((item) => item.createdAt),
  });
  if (!decision.allowed) {
    throw new PersonalizedLearningError(
      "PERSONALIZATION_LIMIT",
      429,
      decision.reason === "DAILY_LIMIT"
        ? "Bạn đã dùng hết lượt tạo bài AI mới trong 24 giờ. Các bài đã tạo vẫn có thể học lại."
        : "Bài AI đang được chuẩn bị hoặc vừa được tạo. Hãy học bài hiện có trước khi tạo bài mới.",
      decision.retryAfterSeconds,
    );
  }
}

export async function getOwnedPersonalizedLesson(
  userId: string,
  lessonId: string,
): Promise<PublicPersonalizedLesson> {
  const lesson = await prisma.personalizedLesson.findFirst({
    where: { id: lessonId, userId, status: "READY" },
  });
  if (!lesson) throw privateNotFound();
  return toPublicPersonalizedLesson(lesson);
}

/**
 * Owner-scoped status for the polling client: READY returns the public
 * lesson, GENERATING/FAILED return a content-free status envelope (not 404).
 */
export async function getOwnedPersonalizedLessonStatus(
  userId: string,
  lessonId: string,
): Promise<PersonalizedLessonStatus> {
  const lesson = await prisma.personalizedLesson.findFirst({
    where: { id: lessonId, userId },
  });
  if (!lesson || lesson.status === "ARCHIVED") throw privateNotFound();
  if (lesson.status === "READY") return toPublicPersonalizedLesson(lesson);
  const targetSkill = SkillKeySchema.safeParse(lesson.targetSkill);
  const stale = lesson.status === "GENERATING"
    && isStaleGeneration(lesson.generationStartedAt ?? lesson.createdAt);
  return {
    id: lesson.id,
    // A GENERATING row whose lease expired is reported as FAILED so the client
    // offers "retry" instead of polling a dead generation forever.
    status: stale ? "FAILED" : lesson.status,
    targetSkill: targetSkill.success ? targetSkill.data : "vocabulary",
    failureCode: stale ? lesson.failureCode ?? "GENERATION_TIMEOUT" : lesson.failureCode,
    generationAttempt: lesson.generationAttempt,
    generationStartedAt: lesson.generationStartedAt?.toISOString() ?? null,
    createdAt: lesson.createdAt.toISOString(),
    retryAfterSeconds: PERSONALIZED_GENERATION_POLL_SECONDS,
  };
}

export async function listOwnedPersonalizedLessons(userId: string) {
  const lessons = await prisma.personalizedLesson.findMany({
    where: { userId, status: "READY" },
    orderBy: { readyAt: "desc" },
    take: 12,
  });
  return lessons.map(toPublicPersonalizedLesson);
}

export async function submitPersonalizedLessonAttempt(input: {
  userId: string;
  lessonId: string;
  exerciseId: string;
  answer: string;
  clientAttemptId: string;
  responseTimeMs?: number;
  /** Plan13 P133: assist cost paid in the Answer Canvas (default 0). */
  hintCount?: number;
  confidence?: number | null;
  assistMode?: string | null;
}): Promise<{
  attempt: {
    id: string;
    score: number;
    correct: boolean | null;
    feedbackVi: string;
    idempotent: boolean;
  };
}> {
  const lesson = await prisma.personalizedLesson.findFirst({
    where: { id: input.lessonId, userId: input.userId, status: "READY" },
    select: {
      id: true,
      targetSkill: true,
      difficulty: true,
      contentJson: true,
      validatorJson: true,
    },
  });
  if (!lesson) throw privateNotFound();
  const existing = await prisma.personalizedLessonAttempt.findUnique({
    where: {
      lessonId_clientAttemptId: {
        lessonId: lesson.id,
        clientAttemptId: input.clientAttemptId,
      },
    },
  });
  if (existing) return { attempt: toAttemptResponse(existing, true) };
  // Plan13 PL2: one graded attempt per exercise per learner. A resubmission
  // with a new clientAttemptId replays the stored result and mints no new
  // evidence (the partial unique index in the migration is the hard fence).
  const graded = await findGradedExerciseAttempt(lesson.id, input.userId, input.exerciseId);
  if (graded) return { attempt: toAttemptResponse(graded, true) };

  const content = parseLessonContent(lesson.contentJson);
  const validator = parseLessonValidator(lesson.validatorJson);
  const exercise = content.exercises.find(
    (item) => item.id === input.exerciseId,
  );
  const answerKey = validator.exercises.find(
    (item) => item.id === input.exerciseId,
  );
  if (!exercise || !answerKey) {
    throw new PersonalizedLearningError(
      "VALIDATION_ERROR",
      400,
      "Bài tập không hợp lệ.",
    );
  }
  const normalizedAnswer = normalizeAnswer(input.answer);
  const correct = answerKey.acceptedAnswers.includes(normalizedAnswer);
  const score = correct ? 1 : 0;
  const feedbackVi = correct
    ? `Chính xác. ${answerKey.feedbackVi}`
    : `Chưa đúng. ${answerKey.feedbackVi}`;

  try {
    const created = await persistPersonalizedLessonAttemptWithAtomicBatch({
      input,
      lesson,
      normalizedAnswer,
      score,
      correct,
      feedbackVi,
    });
    return { attempt: toAttemptResponse(created.row, created.idempotent) };
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const duplicate = await prisma.personalizedLessonAttempt.findUnique({
      where: {
        lessonId_clientAttemptId: {
          lessonId: lesson.id,
          clientAttemptId: input.clientAttemptId,
        },
      },
    });
    if (duplicate) return { attempt: toAttemptResponse(duplicate, true) };
    const gradedRace = await findGradedExerciseAttempt(lesson.id, input.userId, input.exerciseId);
    if (gradedRace) return { attempt: toAttemptResponse(gradedRace, true) };
    throw error;
  }
}

function findGradedExerciseAttempt(lessonId: string, userId: string, exerciseId: string) {
  return prisma.personalizedLessonAttempt.findFirst({
    where: { lessonId, userId, exerciseId },
    orderBy: { createdAt: "asc" },
    select: { id: true, score: true, correct: true, feedbackVi: true },
  });
}

type GeneratedLessonPersistenceInput = {
  lessonId: string;
  userId: string;
  sourceSnapshotHash: string;
  generationKey: string;
  draft: PersonalizedLessonDraft;
  response: {
    provider: string;
    model: string;
    requestId?: string;
  };
};

type OwnedAttemptLesson = {
  id: string;
  targetSkill: string;
  difficulty: number;
};

type PersonalizedAttemptInput = {
  userId: string;
  lessonId: string;
  exerciseId: string;
  answer: string;
  clientAttemptId: string;
  responseTimeMs?: number;
  hintCount?: number;
  confidence?: number | null;
  assistMode?: string | null;
};

type AttemptPersistenceResult = {
  row: {
    id: string;
    score: number;
    correct: boolean | null;
    feedbackVi: string;
  };
  idempotent: boolean;
};

async function persistGeneratedPersonalizedLesson(
  input: GeneratedLessonPersistenceInput,
): Promise<StoredLessonRow> {
  return persistGeneratedPersonalizedLessonWithAtomicBatch(input);
}

async function persistGeneratedPersonalizedLessonWithAtomicBatch(
  input: GeneratedLessonPersistenceInput,
): Promise<StoredLessonRow> {
  // These IDs become the persisted IDs for newly-created vocabulary. Existing
  // core vocabulary is resolved inside the same batch and replaces the
  // temporary content IDs before the lesson becomes READY.
  const vocabularyIds = input.draft.vocabulary.map(() => randomUUID());
  const stored = toStoredPersonalizedLesson(input.draft, vocabularyIds);
  const committedAt = libSqlTimestamp(new Date());
  const commitFence = randomUUID();
  const statements: LibSqlBatchStatement[] = [
    ...input.draft.vocabulary.map((item, index) =>
      atomicPersonalizedVocabularyUpsert({
        lessonId: input.lessonId,
        userId: input.userId,
      sourceSnapshotHash: input.sourceSnapshotHash,
      generationKey: input.generationKey,
        vocabularyId: vocabularyIds[index]!,
        item,
      }),
    ),
    atomicPersonalizedLessonReadyUpdate({
      input,
      stored,
      committedAt,
      commitFence,
    }),
    ...input.draft.vocabulary.map((item) =>
      atomicPersonalizedLessonVocabularyInsert({
        lessonId: input.lessonId,
        userId: input.userId,
        sourceSnapshotHash: input.sourceSnapshotHash,
        commitFence,
        lemma: normalizeLemma(item.lemma),
        isTarget: item.isTarget,
        importance: item.importance,
      }),
    ),
    atomicPersonalizedLessonInteractionInsert({
      input,
      commitFence,
    }),
    {
      // The fence makes every dependent statement a no-op unless this exact
      // batch won the GENERATING -> READY transition. It is cleared before
      // commit, so it can never become a user-visible failure code.
      sql: `UPDATE "PersonalizedLesson"
            SET "failureCode" = NULL
            WHERE "id" = ? AND "userId" = ?
              AND "status" = 'READY' AND "failureCode" = ?`,
      values: [input.lessonId, input.userId, commitFence],
    },
  ];
  const readyStatementIndex = input.draft.vocabulary.length;
  const fenceClearStatementIndex = statements.length - 1;
  const results = await executeAtomicLibSqlBatch(statements);
  if (
    results[readyStatementIndex]?.changes !== 1 ||
    results[fenceClearStatementIndex]?.changes !== 1
  ) {
    throw new Error("Personalized lesson atomic batch lost its generation fence");
  }

  const ready = await prisma.personalizedLesson.findUnique({
    where: { id: input.lessonId },
  });
  if (!ready || ready.status !== "READY") {
    throw new Error("Personalized lesson atomic batch could not be read back");
  }
  return ready;
}

function atomicPersonalizedVocabularyUpsert(input: {
  lessonId: string;
  userId: string;
  sourceSnapshotHash: string;
  generationKey: string;
  vocabularyId: string;
  item: PersonalizedLessonDraft["vocabulary"][number];
}): LibSqlBatchStatement {
  return {
    sql: `INSERT INTO "VocabularyItem"
            ("id", "lemma", "displayText", "ipa", "meaningVi", "meaningEn", "partOfSpeech", "cefrLevel", "exampleSentence")
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM "PersonalizedLesson"
            WHERE "id" = ? AND "userId" = ?
              AND "status" = 'GENERATING' AND "sourceSnapshotHash" = ?
              AND "generationKey" = ?
          )
          ON CONFLICT("lemma") DO NOTHING`,
    values: [
      input.vocabularyId,
      normalizeLemma(input.item.lemma),
      input.item.displayText,
      input.item.ipa ?? null,
      input.item.meaningVi,
      input.item.meaningEn ?? null,
      input.item.partOfSpeech ?? null,
      input.item.cefrLevel,
      input.item.exampleSentence ?? null,
      input.lessonId,
      input.userId,
      input.sourceSnapshotHash,
      input.generationKey,
    ],
  };
}

function atomicPersonalizedLessonReadyUpdate(input: {
  input: GeneratedLessonPersistenceInput;
  stored: ReturnType<typeof toStoredPersonalizedLesson>;
  committedAt: string | number;
  commitFence: string;
}): LibSqlBatchStatement {
  const contentIdAssignments = input.input.draft.vocabulary.map(
    (_item, index) =>
      `'$.vocabulary[${index}].id', (
        SELECT "id" FROM "VocabularyItem" WHERE "lemma" = ?
      )`,
  );
  return {
    sql: `UPDATE "PersonalizedLesson"
          SET "status" = 'READY',
              "title" = ?,
              "objectivesJson" = ?,
              "contentJson" = json_set(?, ${contentIdAssignments.join(", ")}),
              "validatorJson" = ?,
              "provider" = ?,
              "model" = ?,
              "promptVersion" = ?,
              "failureCode" = ?,
              "readyAt" = ?
          WHERE "id" = ? AND "userId" = ?
            AND "status" = 'GENERATING' AND "sourceSnapshotHash" = ?
            AND "generationKey" = ?`,
    values: [
      input.input.draft.title,
      JSON.stringify(input.input.draft.objectives),
      JSON.stringify(input.stored.content),
      ...input.input.draft.vocabulary.map((item) => normalizeLemma(item.lemma)),
      JSON.stringify(input.stored.validator),
      input.input.response.provider,
      input.input.response.model,
      PROMPT_VERSION,
      input.commitFence,
      input.committedAt,
      input.input.lessonId,
      input.input.userId,
      input.input.sourceSnapshotHash,
      input.input.generationKey,
    ],
  };
}

function atomicPersonalizedLessonVocabularyInsert(input: {
  lessonId: string;
  userId: string;
  sourceSnapshotHash: string;
  commitFence: string;
  lemma: string;
  isTarget: boolean;
  importance: number;
}): LibSqlBatchStatement {
  return {
    sql: `INSERT INTO "PersonalizedLessonVocabulary"
            ("personalizedLessonId", "vocabularyItemId", "isTarget", "importance")
          SELECT ?, "id", ?, ?
          FROM "VocabularyItem"
          WHERE "lemma" = ?
            AND EXISTS (
              SELECT 1 FROM "PersonalizedLesson"
              WHERE "id" = ? AND "userId" = ?
                AND "status" = 'READY' AND "sourceSnapshotHash" = ?
                AND "failureCode" = ?
            )
          ON CONFLICT("personalizedLessonId", "vocabularyItemId")
          DO UPDATE SET "isTarget" = excluded."isTarget", "importance" = excluded."importance"`,
    values: [
      input.lessonId,
      libSqlBoolean(input.isTarget),
      input.importance,
      input.lemma,
      input.lessonId,
      input.userId,
      input.sourceSnapshotHash,
      input.commitFence,
    ],
  };
}

function atomicPersonalizedLessonInteractionInsert(input: {
  input: GeneratedLessonPersistenceInput;
  commitFence: string;
}): LibSqlBatchStatement {
  return {
    sql: `INSERT INTO "AIInteraction"
            ("id", "userId", "purpose", "model", "provider", "promptVersion", "inputHash", "validatedOutput", "latencyMs", "traceId", "success")
          SELECT ?, ?, 'personalized_lesson', ?, ?, ?, ?, ?, NULL, ?, 1
          WHERE EXISTS (
            SELECT 1 FROM "PersonalizedLesson"
            WHERE "id" = ? AND "userId" = ?
              AND "status" = 'READY' AND "sourceSnapshotHash" = ?
              AND "failureCode" = ?
          )`,
    values: [
      randomUUID(),
      input.input.userId,
      input.input.response.model,
      input.input.response.provider,
      PROMPT_VERSION,
      input.input.sourceSnapshotHash,
      JSON.stringify({
        lessonId: input.input.lessonId,
        targetSkill: input.input.draft.targetSkill,
        cefrLevel: input.input.draft.cefrLevel,
        difficulty: input.input.draft.difficulty,
      }),
      input.input.response.requestId ?? null,
      input.input.lessonId,
      input.input.userId,
      input.input.sourceSnapshotHash,
      input.commitFence,
    ],
  };
}

async function persistPersonalizedLessonAttemptWithAtomicBatch(input: {
  input: PersonalizedAttemptInput;
  lesson: OwnedAttemptLesson;
  normalizedAnswer: string;
  score: number;
  correct: boolean;
  feedbackVi: string;
}): Promise<AttemptPersistenceResult> {
  const attemptId = randomUUID();
  const evidenceId = randomUUID();
  const skillMasteryId = randomUUID();
  const nowDate = new Date();
  const now = libSqlTimestamp(nowDate);
  const performance = masteryPerformance(input.score, input.lesson.difficulty);
  const initialMastery = roundMastery(
    MASTERY_INITIAL + PERSONALIZED_MASTERY_ALPHA * (performance - MASTERY_INITIAL),
  );
  const results = await executeAtomicLibSqlBatch([
    atomicPersonalizedAttemptInsert({
      attemptId,
      ...input,
      createdAt: now,
    }),
    atomicPersonalizedEvidenceInsert({
      evidenceId,
      attemptId,
      ...input,
      createdAt: now,
    }),
    {
      sql: `INSERT INTO "SkillMastery"
              ("id", "userId", "skillKey", "masteryScore", "evidenceCount", "lastUpdatedAt")
            SELECT ?, ?, ?, ?, 1, ?
            WHERE EXISTS (SELECT 1 FROM "AdaptiveEvidence" WHERE "id" = ?)
              AND NOT EXISTS (
                SELECT 1 FROM "SkillMastery" WHERE "userId" = ? AND "skillKey" = ?
              )`,
      values: [
        skillMasteryId,
        input.input.userId,
        input.lesson.targetSkill,
        initialMastery,
        now,
        evidenceId,
        input.input.userId,
        input.lesson.targetSkill,
      ],
    },
    {
      // Mirrors applySkillMasteryUpdate (SPEC-P132 §8): new = old + alpha * (performance - old).
      sql: `UPDATE "SkillMastery"
            SET "masteryScore" = ROUND(
                  MIN(?, MAX(?, "masteryScore" + (? - "masteryScore") * ?)) * 1000
                ) / 1000,
                "evidenceCount" = "evidenceCount" + 1,
                "lastUpdatedAt" = ?
            WHERE "userId" = ? AND "skillKey" = ? AND "id" <> ?
              AND EXISTS (SELECT 1 FROM "AdaptiveEvidence" WHERE "id" = ?)`,
      values: [
        MASTERY_MAX,
        MASTERY_MIN,
        performance,
        PERSONALIZED_MASTERY_ALPHA,
        now,
        input.input.userId,
        input.lesson.targetSkill,
        skillMasteryId,
        evidenceId,
      ],
    },
    buildPersonalizedCalibrationStatement({
      userId: input.input.userId,
      evidenceId,
      now,
      recheckCutoff: libSqlTimestamp(
        new Date(nowDate.getTime() - CALIBRATION_RECHECK_INTERVAL_MS),
      ),
    }),
  ]);

  if (results[0]?.changes === 1) {
    return {
      row: {
        id: attemptId,
        score: input.score,
        correct: input.correct,
        feedbackVi: input.feedbackVi,
      },
      idempotent: false,
    };
  }

  const duplicate = await prisma.personalizedLessonAttempt.findUnique({
    where: {
      lessonId_clientAttemptId: {
        lessonId: input.lesson.id,
        clientAttemptId: input.input.clientAttemptId,
      },
    },
  });
  if (duplicate) return { row: duplicate, idempotent: true };
  const graded = await findGradedExerciseAttempt(
    input.lesson.id,
    input.input.userId,
    input.input.exerciseId,
  );
  if (graded) return { row: graded, idempotent: true };
  throw privateNotFound();
}

/** SPEC-P132 §8: performance = clamp(score / clamp(difficulty, 0.6, 1.8), 0, 1). */
export function masteryPerformance(score: number, difficulty: number) {
  const boundedDifficulty = Math.min(1.8, Math.max(0.6, Number.isFinite(difficulty) ? difficulty : 1));
  return Math.min(1, Math.max(0, score * (1 / boundedDifficulty)));
}

function roundMastery(value: number) {
  return Math.round(Math.min(MASTERY_MAX, Math.max(MASTERY_MIN, value)) * 1000) / 1000;
}

function atomicPersonalizedAttemptInsert(input: {
  attemptId: string;
  input: PersonalizedAttemptInput;
  lesson: OwnedAttemptLesson;
  normalizedAnswer: string;
  score: number;
  correct: boolean;
  feedbackVi: string;
  createdAt: string | number;
}): LibSqlBatchStatement {
  return {
    sql: `INSERT INTO "PersonalizedLessonAttempt"
            ("id", "lessonId", "userId", "exerciseId", "clientAttemptId", "submittedAnswer", "normalizedAnswer", "score", "correct", "feedbackVi", "gradingMethod", "responseTimeMs", "hintCount", "confidence", "assistMode", "createdAt")
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SERVER_EXACT', ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM "PersonalizedLesson"
            WHERE "id" = ? AND "userId" = ? AND "status" = 'READY'
          )
            AND NOT EXISTS (
              SELECT 1 FROM "PersonalizedLessonAttempt"
              WHERE "lessonId" = ? AND "clientAttemptId" = ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM "PersonalizedLessonAttempt"
              WHERE "lessonId" = ? AND "exerciseId" = ? AND "userId" = ?
                AND "score" IS NOT NULL
            )
          ON CONFLICT("lessonId", "clientAttemptId") DO NOTHING`,
    values: [
      input.attemptId,
      input.lesson.id,
      input.input.userId,
      input.input.exerciseId,
      input.input.clientAttemptId,
      input.input.answer,
      input.normalizedAnswer,
      input.score,
      libSqlBoolean(input.correct),
      input.feedbackVi,
      input.input.responseTimeMs ?? null,
      input.input.hintCount ?? 0,
      input.input.confidence ?? null,
      input.input.assistMode ?? null,
      input.createdAt,
      input.lesson.id,
      input.input.userId,
      input.lesson.id,
      input.input.clientAttemptId,
      input.lesson.id,
      input.input.exerciseId,
      input.input.userId,
    ],
  };
}

function atomicPersonalizedEvidenceInsert(input: {
  evidenceId: string;
  attemptId: string;
  input: PersonalizedAttemptInput;
  lesson: OwnedAttemptLesson;
  score: number;
  createdAt: string | number;
}): LibSqlBatchStatement {
  return {
    sql: `INSERT INTO "AdaptiveEvidence"
            ("id", "userId", "sourceKind", "sourceId", "skillKey", "score", "confidence", "difficulty", "gradingMethod", "responseTimeMs", "createdAt")
          SELECT ?, ?, 'PERSONALIZED_LESSON_ATTEMPT', ?, ?, ?, 1, ?, 'SERVER_EXACT', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM "PersonalizedLessonAttempt" WHERE "id" = ?
          )`,
    values: [
      input.evidenceId,
      input.input.userId,
      input.attemptId,
      input.lesson.targetSkill,
      input.score,
      input.lesson.difficulty,
      input.input.responseTimeMs ?? null,
      input.createdAt,
      input.attemptId,
    ],
  };
}

async function buildLearnerSnapshot(
  userId: string,
  requestedSkill?: SkillKey,
): Promise<LearnerSnapshot> {
  const now = new Date();
  const [profile, skills, dueVocabulary, curriculumGrounding, evidence] =
    await Promise.all([
      prisma.learnerProfile.findUnique({ where: { userId } }),
      prisma.skillMastery.findMany({
        where: { userId, skillKey: { in: TARGET_SKILLS } },
        orderBy: { skillKey: "asc" },
        select: { skillKey: true, masteryScore: true },
      }),
      prisma.vocabularyMastery.findMany({
        where: { userId, nextReviewAt: { lte: now } },
        orderBy: { nextReviewAt: "asc" },
        take: 8,
        select: {
          vocabularyItem: {
            select: { lemma: true, meaningVi: true, cefrLevel: true },
          },
        },
      }),
      prisma.lessonVocabulary.findMany({
        where: { lesson: { status: "PUBLISHED" } },
        orderBy: { vocabularyItem: { lemma: "asc" } },
        take: 12,
        select: {
          vocabularyItem: {
            select: { lemma: true, meaningVi: true, cefrLevel: true },
          },
        },
      }),
      prisma.adaptiveEvidence.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { skillKey: true, score: true, difficulty: true },
      }),
    ]);
  if (!profile) throw privateNotFound();
  const skillMastery = Object.fromEntries(
    skills
      .filter((item): item is { skillKey: SkillKey; masteryScore: number } =>
        TARGET_SKILLS.includes(item.skillKey as SkillKey),
      )
      .map((item) => [item.skillKey, item.masteryScore]),
  ) as Partial<Record<SkillKey, number>>;
  const targetSkill = requestedSkill ?? chooseTargetSkill(skillMastery);
  return {
    targetSkill,
    cefrLevel: profile.estimatedCefrLevel,
    difficulty: difficultyFromMastery(skillMastery[targetSkill]),
    calibrationStatus: profile.calibrationStatus,
    preferredTopics: profile.preferredTopics
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5),
    skillMastery,
    dueVocabulary: dueVocabulary.map(({ vocabularyItem }) => vocabularyItem),
    curriculumGrounding: curriculumGrounding.map(
      ({ vocabularyItem }) => vocabularyItem,
    ),
    recentEvidence: evidence,
  };
}

function chooseTargetSkill(
  skillMastery: Partial<Record<SkillKey, number>>,
): SkillKey {
  return TARGET_SKILLS.reduce((weakest, skill) =>
    (skillMastery[skill] ?? 0.5) < (skillMastery[weakest] ?? 0.5)
      ? skill
      : weakest,
  );
}

function hashSnapshot(snapshot: LearnerSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function toPublicPersonalizedLesson(
  row: StoredLessonRow,
): PublicPersonalizedLesson {
  const objectives = parseObjectives(row.objectivesJson);
  const content = parseLessonContent(row.contentJson);
  if (!TARGET_SKILLS.includes(row.targetSkill as SkillKey) || !row.title) {
    throw new Error("Invalid ready personalized lesson record");
  }
  return {
    id: row.id,
    status: "READY",
    title: row.title,
    targetSkill: row.targetSkill as SkillKey,
    cefrLevel: row.cefrLevel,
    difficulty: row.difficulty,
    objectives,
    content,
    createdAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
  };
}

function parseObjectives(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function parseLessonContent(raw: string | null) {
  try {
    return PersonalizedLessonContentSchema.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new Error("Invalid personalized lesson content record");
  }
}

function parseLessonValidator(raw: string | null) {
  try {
    return PersonalizedLessonValidatorSchema.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new Error("Invalid personalized lesson validator record");
  }
}

function toAttemptResponse(
  attempt: {
    id: string;
    score: number;
    correct: boolean | null;
    feedbackVi: string;
  },
  idempotent: boolean,
) {
  return { ...attempt, idempotent };
}

function privateNotFound() {
  return new PersonalizedLearningError(
    "PRIVATE_NOT_FOUND",
    404,
    "Không tìm thấy bài học riêng tư này.",
  );
}

function isStaleGeneration(startedAt: Date) {
  return Date.now() - startedAt.getTime() > GENERATION_STALE_MS;
}

/** Prisma P2002 or a raw libSQL UNIQUE violation (the partial index has no Prisma name). */
function isUniqueConstraint(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === "P2002") return true;
  const message = error instanceof Error ? error.message : "";
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(message);
}
