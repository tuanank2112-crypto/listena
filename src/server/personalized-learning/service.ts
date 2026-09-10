import "server-only";

import { createHash } from "node:crypto";
import type { CefrLevel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AIUnavailableError,
  isAIProviderError,
} from "@/server/ai/errors";
import {
  createConfiguredOpenAIResponsesProvider,
  type JsonSchema,
} from "@/server/ai/openai-responses-provider";
import { updateMastery } from "@/core/learner-model/mastery";
import {
  assessCalibration,
  difficultyFromMastery,
} from "@/server/personalized-learning/calibration";
import {
  normalizeAnswer,
  normalizeLemma,
  PERSONALIZED_LESSON_JSON_SCHEMA,
  PersonalizedLessonContentSchema,
  PersonalizedLessonDraftSchema,
  PersonalizedLessonValidatorSchema,
  type PersonalizedLessonContent,
  type PersonalizedLessonValidator,
  type SkillKey,
  toStoredPersonalizedLesson,
} from "@/server/personalized-learning/contracts";
import {
  evaluatePersonalizationBudget,
  PERSONALIZED_LESSON_ACTIVE_WINDOW_MS,
  PERSONALIZED_LESSON_DAILY_LIMIT,
  PERSONALIZED_LESSON_MIN_INTERVAL_MS,
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
  dueVocabulary: Array<{ lemma: string; meaningVi: string; cefrLevel: CefrLevel }>;
  curriculumGrounding: Array<{
    lemma: string;
    meaningVi: string;
    cefrLevel: CefrLevel;
  }>;
  recentEvidence: Array<{ skillKey: string; score: number; difficulty: number }>;
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
  const generationKey = `${snapshot.targetSkill}:${sourceSnapshotHash}`;
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
    const provider = createConfiguredOpenAIResponsesProvider();
    if (!provider) {
      throw new AIUnavailableError({ reason: "provider_not_configured" });
    }
    const response = await provider.generateJson<unknown>({
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
    const draft = PersonalizedLessonDraftSchema.safeParse(response.output);
    if (
      !draft.success ||
      draft.data.targetSkill !== snapshot.targetSkill ||
      draft.data.cefrLevel !== snapshot.cefrLevel ||
      Math.abs(draft.data.difficulty - snapshot.difficulty) > 0.21
    ) {
      throw new AIUnavailableError({
        reason: "schema_validation_failed",
        provider: response.provider,
        model: response.model,
        requestId: response.requestId,
      });
    }

    const persisted = await prisma.$transaction(async (tx) => {
      const vocabulary = await Promise.all(
        draft.data.vocabulary.map((item) =>
          tx.vocabularyItem.upsert({
            where: { lemma: normalizeLemma(item.lemma) },
            // AI must never silently rewrite shared/core lexical records.
            update: {},
            create: {
              lemma: normalizeLemma(item.lemma),
              displayText: item.displayText,
              ipa: item.ipa ?? null,
              meaningVi: item.meaningVi,
              meaningEn: item.meaningEn ?? null,
              partOfSpeech: item.partOfSpeech ?? null,
              cefrLevel: item.cefrLevel,
              exampleSentence: item.exampleSentence ?? null,
            },
            select: { id: true },
          }),
        ),
      );
      const stored = toStoredPersonalizedLesson(
        draft.data,
        vocabulary.map((item) => item.id),
      );
      const ready = await tx.personalizedLesson.update({
        where: { id: row.id },
        data: {
          status: "READY",
          title: draft.data.title,
          objectivesJson: JSON.stringify(draft.data.objectives),
          contentJson: JSON.stringify(stored.content),
          validatorJson: JSON.stringify(stored.validator),
          provider: response.provider,
          model: response.model,
          promptVersion: PROMPT_VERSION,
          readyAt: new Date(),
          vocabulary: {
            create: vocabulary.map((item, index) => ({
              vocabularyItemId: item.id,
              isTarget: draft.data.vocabulary[index]!.isTarget,
              importance: draft.data.vocabulary[index]!.importance,
            })),
          },
        },
      });
      await tx.aIInteraction.create({
        data: {
          userId,
          purpose: "personalized_lesson",
          provider: response.provider,
          model: response.model,
          promptVersion: PROMPT_VERSION,
          inputHash: sourceSnapshotHash,
          validatedOutput: JSON.stringify({
            lessonId: ready.id,
            targetSkill: ready.targetSkill,
            cefrLevel: ready.cefrLevel,
            difficulty: ready.difficulty,
          }),
          latencyMs: null,
          traceId: response.requestId,
          success: true,
        },
      });
      return ready;
    });
    return { lesson: toPublicPersonalizedLesson(persisted), reused: false };
  } catch (error) {
    await prisma.personalizedLesson.updateMany({
      where: { id: row.id, status: "GENERATING" },
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
        createdAt: { gte: new Date(now.getTime() - PERSONALIZED_LESSON_ACTIVE_WINDOW_MS) },
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
  const exercise = content.exercises.find((item) => item.id === input.exerciseId);
  const answerKey = validator.exercises.find((item) => item.id === input.exerciseId);
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
    const created = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.personalizedLessonAttempt.findUnique({
        where: {
          lessonId_clientAttemptId: {
            lessonId: lesson.id,
            clientAttemptId: input.clientAttemptId,
          },
        },
      });
      if (duplicate) return { row: duplicate, idempotent: true };

      const attempt = await tx.personalizedLessonAttempt.create({
        data: {
          lessonId: lesson.id,
          userId: input.userId,
          exerciseId: input.exerciseId,
          clientAttemptId: input.clientAttemptId,
          submittedAnswer: input.answer,
          normalizedAnswer,
          score,
          correct,
          feedbackVi,
          gradingMethod: "SERVER_EXACT",
          responseTimeMs: input.responseTimeMs,
        },
      });
      await tx.adaptiveEvidence.create({
        data: {
          userId: input.userId,
          sourceKind: "PERSONALIZED_LESSON_ATTEMPT",
          sourceId: attempt.id,
          skillKey: lesson.targetSkill,
          score,
          confidence: 1,
          difficulty: lesson.difficulty,
          gradingMethod: "SERVER_EXACT",
          responseTimeMs: input.responseTimeMs,
        },
      });
      await updateSkillMasteryInTransaction(
        tx,
        input.userId,
        lesson.targetSkill,
        score,
        lesson.difficulty,
      );
      await updateCalibrationInTransaction(tx, input.userId);
      return { row: attempt, idempotent: false };
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

async function buildLearnerSnapshot(userId: string, requestedSkill?: SkillKey): Promise<LearnerSnapshot> {
  const now = new Date();
  const [profile, skills, dueVocabulary, curriculumGrounding, evidence] = await Promise.all([
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
    curriculumGrounding: curriculumGrounding.map(({ vocabularyItem }) => vocabularyItem),
    recentEvidence: evidence,
  };
}

function chooseTargetSkill(skillMastery: Partial<Record<SkillKey, number>>): SkillKey {
  return TARGET_SKILLS.reduce((weakest, skill) =>
    (skillMastery[skill] ?? 0.5) < (skillMastery[weakest] ?? 0.5)
      ? skill
      : weakest,
  );
}

function hashSnapshot(snapshot: LearnerSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function toPublicPersonalizedLesson(row: StoredLessonRow): PublicPersonalizedLesson {
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
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
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

async function updateSkillMasteryInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  skillKey: string,
  score: number,
  difficulty: number,
) {
  const existing = await tx.skillMastery.findUnique({
    where: { userId_skillKey: { userId, skillKey } },
    select: { masteryScore: true },
  });
  const updated = updateMastery({
    oldMastery: existing?.masteryScore ?? 0.5,
    attemptScore: score,
    hintCount: 0,
    replayCount: 0,
    difficulty,
  });
  await tx.skillMastery.upsert({
    where: { userId_skillKey: { userId, skillKey } },
    create: {
      userId,
      skillKey,
      masteryScore: updated.newMastery,
      evidenceCount: 1,
    },
    update: {
      masteryScore: updated.newMastery,
      evidenceCount: { increment: 1 },
      lastUpdatedAt: new Date(),
    },
  });
}

async function updateCalibrationInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const [profile, evidence] = await Promise.all([
    tx.learnerProfile.findUnique({
      where: { userId },
      select: { estimatedCefrLevel: true, calibrationStatus: true },
    }),
    tx.adaptiveEvidence.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { skillKey: true, score: true, confidence: true },
    }),
  ]);
  if (!profile) return;
  const calibrated = assessCalibration({
    currentLevel: profile.estimatedCefrLevel,
    existingStatus: profile.calibrationStatus,
    evidence,
  });
  await tx.learnerProfile.update({
    where: { userId },
    data: {
      calibrationStatus: calibrated.status,
      estimatedCefrLevel: calibrated.nextLevel,
      ...(calibrated.status === "CALIBRATED" && profile.calibrationStatus !== "CALIBRATED"
        ? { calibratedAt: new Date() }
        : {}),
    },
  });
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
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "P2002";
}
