import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { CefrLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  libSqlBoolean,
  libSqlTimestamp,
  executeAtomicLibSqlBatch,
  type LibSqlBatchStatement,
} from "@/lib/libsql-batch";
import {
  MASTERY_INITIAL,
  MASTERY_MAX,
  MASTERY_MIN,
  MASTERY_NEW_WEIGHT,
  MASTERY_OLD_WEIGHT,
} from "@/core/constants";
import { AIUnavailableError, isAIProviderError } from "@/server/ai/errors";
import {
  createConfiguredStructuredAIProvider,
  type JsonSchema,
} from "@/server/ai/openai-responses-provider";
import {
  reserveUserAICall,
  settleUserAICall,
} from "@/server/ai/request-budget";
import { updateMastery } from "@/core/learner-model/mastery";
import {
  CALIBRATION_CONFIDENCE,
  CALIBRATION_FINAL_EVIDENCE,
  CALIBRATION_MIN_EVIDENCE,
  CALIBRATION_MIN_SKILLS,
  difficultyFromMastery,
} from "@/server/personalized-learning/calibration";
import {
  normalizeAnswer,
  normalizeLemma,
  PERSONALIZED_LESSON_JSON_SCHEMA,
  PersonalizedLessonContentSchema,
  type PersonalizedLessonDraft,
  PersonalizedLessonDraftSchema,
  type PersonalizedLessonContent,
  PersonalizedLessonValidatorSchema,
  type SkillKey,
  toStoredPersonalizedLesson,
} from "@/server/personalized-learning/contracts";
import {
  evaluatePersonalizationBudget,
  PERSONALIZED_LESSON_ACTIVE_WINDOW_MS,
  PERSONALIZED_LESSON_DAILY_LIMIT,
} from "@/server/personalized-learning/generation-budget";

const PROMPT_VERSION = "personalized-lesson-responses-1.0";
const GENERATION_STALE_MS = 90_000;
const ACTIVE_GENERATION_RETRY_SECONDS = 45;
const TARGET_SKILLS: SkillKey[] = [
  "listening",
  "vocabulary",
  "spelling",
  "grammar",
  "communication",
];

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
  title: string;
  targetSkill: SkillKey;
  cefrLevel: CefrLevel;
  difficulty: number;
  objectives: string[];
  content: PersonalizedLessonContent;
  createdAt: string;
  readyAt: string | null;
};

export async function provisionPersonalizedLesson(
  userId: string,
  requestedSkill?: SkillKey,
): Promise<{ lesson: PublicPersonalizedLesson; reused: boolean }> {
  const snapshot = await buildLearnerSnapshot(userId, requestedSkill);
  const sourceSnapshotHash = hashSnapshot(snapshot);
  // A fresh private lease prevents a late response from a previous attempt
  // from turning a newer GENERATING row into READY.
  const generationKey = randomUUID();
  let row = await prisma.personalizedLesson.findUnique({
    where: {
      userId_targetSkill_sourceSnapshotHash: {
        userId,
        targetSkill: snapshot.targetSkill,
        sourceSnapshotHash,
      },
    },
  });

  if (row?.status === "READY") {
    return { lesson: toPublicPersonalizedLesson(row), reused: true };
  }
  if (row?.status === "GENERATING" && !isStaleGeneration(row.createdAt)) {
    throw new PersonalizedLearningError(
      "AI_RATE_LIMITED",
      429,
      "Bài học AI đang được tạo. Vui lòng chờ trong giây lát.",
      ACTIVE_GENERATION_RETRY_SECONDS,
    );
  }

  await assertPersonalizationBudget(userId);

  if (row) {
    row = await prisma.personalizedLesson.update({
      where: { id: row.id },
      data: {
        status: "GENERATING",
        generationKey,
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
  } else {
    try {
      row = await prisma.personalizedLesson.create({
        data: {
          userId,
          status: "GENERATING",
          targetSkill: snapshot.targetSkill,
          cefrLevel: snapshot.cefrLevel,
          difficulty: snapshot.difficulty,
          sourceSnapshotHash,
          generationKey,
          promptVersion: PROMPT_VERSION,
        },
      });
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
        return { lesson: toPublicPersonalizedLesson(concurrent), reused: true };
      }
      throw new PersonalizedLearningError(
        "AI_RATE_LIMITED",
        429,
        "Bài học AI đang được tạo. Vui lòng chờ trong giây lát.",
        ACTIVE_GENERATION_RETRY_SECONDS,
      );
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
      requestIdentity: `${row.id}:${sourceSnapshotHash}`,
      provider: provider.providerName,
      model: provider.modelName,
    });
    let response;
    try {
      response = await provider.generateJson<unknown>({
        purpose: "personalized_lesson",
        systemPrompt: [
          "You create a private English self-study lesson for one Vietnamese learner.",
          "Use only the supplied learner snapshot and verified curriculum grounding.",
          "Make all exercise answers objectively gradable; never ask for private data.",
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
            exerciseCount: "4 to 6",
            vocabularyCount: "4 to 8",
          },
        },
        schemaName: "personalized_lesson",
        schema: PERSONALIZED_LESSON_JSON_SCHEMA as JsonSchema,
        safetyIdentifier: userId,
        maxOutputTokens: 2_200,
      });
    } catch (error) {
      await settleUserAICall(reservation, {
        success: false,
        provider: provider.providerName,
        model: provider.modelName,
        failureReason: isAIProviderError(error)
          ? error.details.reason
          : "unknown",
      });
      throw error;
    }
    const draft = PersonalizedLessonDraftSchema.safeParse(response.output);
    if (
      !draft.success ||
      draft.data.targetSkill !== snapshot.targetSkill ||
      draft.data.cefrLevel !== snapshot.cefrLevel ||
      Math.abs(draft.data.difficulty - snapshot.difficulty) > 0.21
    ) {
      await settleUserAICall(reservation, {
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

    await settleUserAICall(reservation, {
      success: true,
      provider: response.provider,
      model: response.model,
      requestId: response.requestId,
    });

    const persisted = await persistGeneratedPersonalizedLesson({
      lessonId: row.id,
      userId,
      sourceSnapshotHash,
      draft: draft.data,
      response,
      generationKey,
    });
    return { lesson: toPublicPersonalizedLesson(persisted), reused: false };
  } catch (error) {
    await prisma.personalizedLesson.updateMany({
      where: { id: row.id, status: "GENERATING", generationKey },
      data: {
        status: "FAILED",
        failureCode: isAIProviderError(error) ? error.code : "AI_UNAVAILABLE",
      },
    });
    if (isAIProviderError(error)) throw error;
    throw new AIUnavailableError({ reason: "schema_validation_failed" });
  }
}

async function assertPersonalizationBudget(userId: string) {
  const now = new Date();
  const [activeGeneration, recentGenerations] = await Promise.all([
    prisma.personalizedLesson.findFirst({
      where: {
        userId,
        status: "GENERATING",
        createdAt: {
          gte: new Date(now.getTime() - PERSONALIZED_LESSON_ACTIVE_WINDOW_MS),
        },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
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
    activeGenerationCreatedAt: activeGeneration?.createdAt,
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
    throw error;
  }
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
  const now = libSqlTimestamp(new Date());
  const initialMastery = updateMastery({
    oldMastery: MASTERY_INITIAL,
    attemptScore: input.score,
    hintCount: 0,
    replayCount: 0,
    difficulty: input.lesson.difficulty,
  }).newMastery;
  const performanceContribution =
    input.score * (1 / input.lesson.difficulty) * MASTERY_NEW_WEIGHT;
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
      sql: `UPDATE "SkillMastery"
            SET "masteryScore" = ROUND(
                  MIN(?, MAX(?, ("masteryScore" * ?) + ?)) * 1000
                ) / 1000,
                "evidenceCount" = "evidenceCount" + 1,
                "lastUpdatedAt" = ?
            WHERE "userId" = ? AND "skillKey" = ? AND "id" <> ?
              AND EXISTS (SELECT 1 FROM "AdaptiveEvidence" WHERE "id" = ?)`,
      values: [
        MASTERY_MAX,
        MASTERY_MIN,
        MASTERY_OLD_WEIGHT,
        performanceContribution,
        now,
        input.input.userId,
        input.lesson.targetSkill,
        skillMasteryId,
        evidenceId,
      ],
    },
    atomicPersonalizedCalibrationUpdate({
      userId: input.input.userId,
      evidenceId,
      updatedAt: now,
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
  throw privateNotFound();
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
            ("id", "lessonId", "userId", "exerciseId", "clientAttemptId", "submittedAnswer", "normalizedAnswer", "score", "correct", "feedbackVi", "gradingMethod", "responseTimeMs", "createdAt")
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SERVER_EXACT', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM "PersonalizedLesson"
            WHERE "id" = ? AND "userId" = ? AND "status" = 'READY'
          )
            AND NOT EXISTS (
              SELECT 1 FROM "PersonalizedLessonAttempt"
              WHERE "lessonId" = ? AND "clientAttemptId" = ?
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
      input.createdAt,
      input.lesson.id,
      input.input.userId,
      input.lesson.id,
      input.input.clientAttemptId,
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

function atomicPersonalizedCalibrationUpdate(input: {
  userId: string;
  evidenceId: string;
  updatedAt: string | number;
}): LibSqlBatchStatement {
  return {
    sql: `WITH "recentEvidence" AS (
            SELECT "skillKey", "score", "confidence"
            FROM "AdaptiveEvidence"
            WHERE "userId" = ?
            ORDER BY "createdAt" DESC
            LIMIT 24
          ),
          "calibration" AS (
            SELECT
              COALESCE(SUM(CASE WHEN "confidence" >= ? THEN 1 ELSE 0 END), 0) AS "qualifyingCount",
              COUNT(DISTINCT CASE WHEN "confidence" >= ? THEN "skillKey" END) AS "qualifyingSkillCount",
              AVG(CASE WHEN "confidence" >= ? THEN "score" END) AS "averageScore"
            FROM "recentEvidence"
          )
          UPDATE "LearnerProfile"
          SET "calibrationStatus" = CASE
                WHEN (SELECT "qualifyingSkillCount" FROM "calibration") < ?
                  OR (SELECT "qualifyingCount" FROM "calibration") < ?
                  THEN CASE WHEN "calibrationStatus" = 'CALIBRATED' THEN 'CALIBRATED' ELSE 'UNASSESSED' END
                WHEN (SELECT "qualifyingCount" FROM "calibration") < ? THEN 'CALIBRATING'
                ELSE 'CALIBRATED'
              END,
              "estimatedCefrLevel" = CASE
                WHEN (SELECT "qualifyingSkillCount" FROM "calibration") >= ?
                  AND (SELECT "qualifyingCount" FROM "calibration") >= ?
                  AND (SELECT "averageScore" FROM "calibration") >= 0.65
                  THEN CASE "estimatedCefrLevel"
                    WHEN 'A1' THEN 'A2' WHEN 'A2' THEN 'B1' WHEN 'B1' THEN 'B2'
                    WHEN 'B2' THEN 'C1' WHEN 'C1' THEN 'C2' ELSE 'C2'
                  END
                WHEN (SELECT "qualifyingSkillCount" FROM "calibration") >= ?
                  AND (SELECT "qualifyingCount" FROM "calibration") >= ?
                  AND (SELECT "averageScore" FROM "calibration") <= 0.35
                  THEN CASE "estimatedCefrLevel"
                    WHEN 'C2' THEN 'C1' WHEN 'C1' THEN 'B2' WHEN 'B2' THEN 'B1'
                    WHEN 'B1' THEN 'A2' WHEN 'A2' THEN 'A1' ELSE 'A1'
                  END
                ELSE "estimatedCefrLevel"
              END,
              "calibratedAt" = CASE
                WHEN "calibrationStatus" <> 'CALIBRATED'
                  AND (SELECT "qualifyingSkillCount" FROM "calibration") >= ?
                  AND (SELECT "qualifyingCount" FROM "calibration") >= ?
                  THEN ?
                ELSE "calibratedAt"
              END,
              "updatedAt" = ?
          WHERE "userId" = ?
            AND EXISTS (SELECT 1 FROM "AdaptiveEvidence" WHERE "id" = ?)`,
    values: [
      input.userId,
      CALIBRATION_CONFIDENCE,
      CALIBRATION_CONFIDENCE,
      CALIBRATION_CONFIDENCE,
      CALIBRATION_MIN_SKILLS,
      CALIBRATION_MIN_EVIDENCE,
      CALIBRATION_FINAL_EVIDENCE,
      CALIBRATION_MIN_SKILLS,
      CALIBRATION_FINAL_EVIDENCE,
      CALIBRATION_MIN_SKILLS,
      CALIBRATION_FINAL_EVIDENCE,
      CALIBRATION_MIN_SKILLS,
      CALIBRATION_FINAL_EVIDENCE,
      input.updatedAt,
      input.updatedAt,
      input.userId,
      input.evidenceId,
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

function isStaleGeneration(createdAt: Date) {
  return Date.now() - createdAt.getTime() > GENERATION_STALE_MS;
}

function isUniqueConstraint(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
