/**
 * Teacher lesson authoring service: durable request ledger and atomic content graph.
 * Hardened under Plan 10 P103.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  libSqlTimestamp,
  withLibSqlWriteTransaction,
} from "@/lib/libsql-batch";
import {
  hashCanonicalPayload,
  type IdempotentResult,
  IdempotencyConflictError,
  OutcomePendingError,
} from "@/lib/idempotency";
import { createAIProviderFromEnv } from "@/server/ai/provider";
import { isAIProviderError } from "@/server/ai/errors";
import {
  reserveUserAICall,
  settleUserAICall,
} from "@/server/ai/request-budget";
import {
  AILessonDraftSchema,
  type CreateLessonSchema,
  type GenerateLessonSchema,
} from "@/server/validation/schemas";
import logger from "@/lib/logger";
import type { z } from "zod";
import type { CefrLevel } from "@prisma/client";

export type CreateLessonInput = z.infer<typeof CreateLessonSchema>;
export type GenerateLessonInput = z.infer<typeof GenerateLessonSchema>;

export class LessonGraphIncompleteError extends Error {
  readonly code = "LESSON_GRAPH_INCOMPLETE" as const;
  constructor(message: string) {
    super(message);
    this.name = "LessonGraphIncompleteError";
  }
}

export type ReserveResult =
  | { kind: "reserved"; requestId: string }
  | { kind: "replay"; lessonId: string }
  | { kind: "pending"; retryAfterSeconds: number };

export async function reserveLessonCreationRequest(input: {
  userId: string;
  clientRequestId: string;
  requestHash: string;
  mode: "MANUAL" | "AI";
  now: Date;
}): Promise<ReserveResult> {
  const existing = await prisma.lessonCreationRequest.findUnique({
    where: {
      userId_clientRequestId: {
        userId: input.userId,
        clientRequestId: input.clientRequestId,
      },
    },
  });

  if (existing) {
    if (existing.requestHash !== input.requestHash || existing.mode !== input.mode) {
      throw new IdempotencyConflictError(
        "Client request ID already used with different parameters"
      );
    }
    if (existing.status === "COMMITTED" && existing.lessonId) {
      return { kind: "replay", lessonId: existing.lessonId };
    }
    if (existing.status === "PENDING") {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((existing.leaseExpiresAt.getTime() - input.now.getTime()) / 1000)
      );
      return { kind: "pending", retryAfterSeconds: Math.min(30, remainingSeconds) };
    }
    if (existing.status === "UNKNOWN") {
      throw new OutcomePendingError(
        15,
        "Lesson creation outcome uncertain; do not retry automatically"
      );
    }
  }

  const requestId = randomUUID();
  const leaseDurationMs = input.mode === "AI" ? 120000 : 30000;
  const leaseExpiresAt = new Date(input.now.getTime() + leaseDurationMs);

  // If previous request row was FAILED with same hash, update lease via CAS
  if (existing && existing.status === "FAILED") {
    const updated = await prisma.lessonCreationRequest.updateMany({
      where: { id: existing.id, status: "FAILED" },
      data: {
        status: "PENDING",
        leaseExpiresAt,
        errorCode: null,
      },
    });
    if (updated.count === 1) {
      return { kind: "reserved", requestId: existing.id };
    }
  }

  try {
    await prisma.lessonCreationRequest.create({
      data: {
        id: requestId,
        userId: input.userId,
        clientRequestId: input.clientRequestId,
        requestHash: input.requestHash,
        mode: input.mode,
        status: "PENDING",
        leaseExpiresAt,
      },
    });
    return { kind: "reserved", requestId };
  } catch (error) {
    const rechecked = await prisma.lessonCreationRequest.findUnique({
      where: {
        userId_clientRequestId: {
          userId: input.userId,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (rechecked) {
      if (rechecked.requestHash !== input.requestHash || rechecked.mode !== input.mode) {
        throw new IdempotencyConflictError(
          "Client request ID already used with different parameters"
        );
      }
      if (rechecked.status === "COMMITTED" && rechecked.lessonId) {
        return { kind: "replay", lessonId: rechecked.lessonId };
      }
      if (rechecked.status === "PENDING") {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((rechecked.leaseExpiresAt.getTime() - input.now.getTime()) / 1000)
        );
        return { kind: "pending", retryAfterSeconds: Math.min(30, remainingSeconds) };
      }
      if (rechecked.status === "UNKNOWN") {
        throw new OutcomePendingError(
          15,
          "Lesson creation outcome uncertain; do not retry automatically"
        );
      }
    }
    throw error;
  }
}

export interface ValidatedLessonDraft {
  title: string;
  topic: string;
  cefrLevel: string;
  learningObjectives: string[];
  transcript: string;
  audioUrl?: string | null;
  accent?: string;
  defaultPlaybackRate?: number;
  estimatedMinutes?: number;
  segments: Array<{
    position: number;
    text: string;
    difficulty?: number;
  }>;
  exercises: Array<{
    type: string;
    prompt: string;
    correctAnswer: string;
    difficulty?: number;
    position: number;
  }>;
  vocabulary: Array<{
    lemma: string;
    displayText: string;
    ipa?: string;
    meaningVi: string;
    meaningEn?: string;
    partOfSpeech?: string;
    cefrLevel?: string;
    exampleSentence?: string;
    isTarget?: boolean;
    importance?: number;
  }>;
}

export async function commitLessonGraph(input: {
  requestId: string;
  userId: string;
  role: "TEACHER" | "ADMIN";
  courseId?: string;
  draft: ValidatedLessonDraft;
  source: "manual" | "ai";
  aiTrace?: {
    provider: string;
    model: string;
    inputHash: string;
    validatedOutput: string;
    latencyMs: number;
  };
}): Promise<{ lessonId: string }> {
  let resolvedCourseId = input.courseId;

  // 1. Resolve course
  if (resolvedCourseId) {
    const course = await prisma.course.findUnique({
      where: { id: resolvedCourseId },
      select: { id: true, createdById: true },
    });
    if (!course) {
      throw new Error("Course not found");
    }
    if (course.createdById !== input.userId && input.role !== "ADMIN") {
      throw new Error("Forbidden");
    }
  } else {
    // Find or create default course for this user
    let defaultCourse = await prisma.course.findFirst({
      where: { createdById: input.userId },
      select: { id: true },
    });
    if (!defaultCourse) {
      defaultCourse = await prisma.course.create({
        data: {
          title: `Course - ${input.draft.cefrLevel}`,
          description: `Auto-generated course for ${input.draft.cefrLevel}`,
          cefrLevel: input.draft.cefrLevel as CefrLevel,
          status: "DRAFT",
          createdById: input.userId,
        },
        select: { id: true },
      });
    }
    resolvedCourseId = defaultCourse.id;
  }

  // 2. Pre-resolve vocabulary items outside the batch so IDs are deterministic
  const vocabMap = new Map<string, string>();
  for (const v of input.draft.vocabulary) {
    const lemma = v.lemma.trim().toLowerCase();
    const item = await prisma.vocabularyItem.upsert({
      where: { lemma },
      create: {
        lemma,
        displayText: v.displayText || v.lemma,
        ipa: v.ipa ?? null,
        meaningVi: v.meaningVi || v.lemma,
        meaningEn: v.meaningEn ?? null,
        partOfSpeech: v.partOfSpeech ?? null,
        cefrLevel: (v.cefrLevel as CefrLevel) ?? "A2",
        exampleSentence: v.exampleSentence ?? null,
      },
      update: {},
    });
    vocabMap.set(lemma, item.id);
  }

  // 3. Execute atomic transaction
  const lessonId = randomUUID();
  const now = new Date();
  const nowTs = libSqlTimestamp(now);

  try {
    await withLibSqlWriteTransaction(async (tx) => {
      // Statement: Insert Lesson
      await tx.execute({
        sql: `INSERT INTO "Lesson" (
          "id", "courseId", "title", "topic", "cefrLevel", "learningObjectives",
          "transcript", "audioUrl", "accent", "defaultPlaybackRate", "estimatedMinutes",
          "status", "createdById", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        args: [
          lessonId,
          resolvedCourseId,
          input.draft.title,
          input.draft.topic,
          input.draft.cefrLevel,
          input.draft.learningObjectives.join("\n"),
          input.draft.transcript,
          input.draft.audioUrl ?? null,
          input.draft.accent ?? "us",
          input.draft.defaultPlaybackRate ?? 1.0,
          input.draft.estimatedMinutes ?? 10,
          input.userId,
          nowTs,
          nowTs,
        ],
      });

      // Statements: Segments
      for (const s of input.draft.segments) {
        await tx.execute({
          sql: `INSERT INTO "LessonSegment" (
            "id", "lessonId", "position", "text", "difficulty"
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [randomUUID(), lessonId, s.position, s.text, s.difficulty ?? 1.0],
        });
      }

      // Statements: Exercises
      for (const e of input.draft.exercises) {
        await tx.execute({
          sql: `INSERT INTO "Exercise" (
            "id", "lessonId", "type", "prompt", "correctAnswer", "difficulty", "position", "metadata"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`,
          args: [
            randomUUID(),
            lessonId,
            e.type,
            e.prompt,
            e.correctAnswer,
            e.difficulty ?? 1.0,
            e.position,
          ],
        });
      }

      // Statements: LessonVocabulary joins
      for (const v of input.draft.vocabulary) {
        const vocabId = vocabMap.get(v.lemma.trim().toLowerCase());
        if (!vocabId) continue;
        await tx.execute({
          sql: `INSERT INTO "LessonVocabulary" (
            "lessonId", "vocabularyItemId", "isTarget", "importance"
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT("lessonId", "vocabularyItemId") DO NOTHING`,
          args: [lessonId, vocabId, v.isTarget !== false ? 1 : 0, v.importance ?? 1.0],
        });
      }

      // Statement: AI interaction trace if present
      if (input.aiTrace) {
        await tx.execute({
          sql: `INSERT INTO "AIInteraction" (
            "id", "userId", "purpose", "provider", "model", "promptVersion",
            "inputHash", "validatedOutput", "latencyMs", "success", "createdAt"
          ) VALUES (?, ?, 'lesson_generation', ?, ?, 'live-lesson-generation-1.0', ?, ?, ?, 1, ?)`,
          args: [
            randomUUID(),
            input.userId,
            input.aiTrace.provider,
            input.aiTrace.model,
            input.aiTrace.inputHash,
            input.aiTrace.validatedOutput,
            input.aiTrace.latencyMs,
            nowTs,
          ],
        });
      }

      // Statement: Update LessonCreationRequest to COMMITTED with CAS check on status = 'PENDING'
      const updateLedgerRes = await tx.execute({
        sql: `UPDATE "LessonCreationRequest" SET
          "status" = 'COMMITTED',
          "lessonId" = ?,
          "updatedAt" = ?
          WHERE "id" = ? AND "userId" = ? AND "status" = 'PENDING'`,
        args: [lessonId, nowTs, input.requestId, input.userId],
      });
      if (updateLedgerRes.rowsAffected !== 1) {
        throw new Error("Ledger commit failed: request was not in PENDING status or was concurrently modified");
      }
    });
  } catch (error) {
    // If atomic commit fails, mark ledger UNKNOWN for AI mode or FAILED for manual
    await prisma.lessonCreationRequest.update({
      where: { id: input.requestId },
      data: {
        status: input.source === "ai" ? "UNKNOWN" : "FAILED",
        errorCode: "BATCH_COMMIT_FAILED",
      },
    }).catch(() => {});
    throw error;
  }

  // Fresh readback check (owner-scoped)
  const committedLesson = await prisma.lesson.findFirst({
    where: { id: lessonId, createdById: input.userId },
    select: { id: true },
  });
  if (!committedLesson) {
    throw new Error("Lesson graph readback failed");
  }

  return { lessonId };
}

export async function createLessonFromRequest(input: {
  userId: string;
  role: "TEACHER" | "ADMIN";
  clientRequestId: string;
  request: CreateLessonInput;
}): Promise<IdempotentResult<{ lessonId: string }>> {
  const now = new Date();
  const requestHash = hashCanonicalPayload({
    courseId: input.request.courseId,
    title: input.request.title,
    topic: input.request.topic,
    cefrLevel: input.request.cefrLevel,
    learningObjectives: input.request.learningObjectives,
    transcript: input.request.transcript,
    audioUrl: input.request.audioUrl ?? null,
    accent: input.request.accent,
    defaultPlaybackRate: input.request.defaultPlaybackRate,
    estimatedMinutes: input.request.estimatedMinutes,
    segments: input.request.segments,
    vocabulary: input.request.vocabulary,
    exercises: input.request.exercises,
  });

  const reservation = await reserveLessonCreationRequest({
    userId: input.userId,
    clientRequestId: input.clientRequestId,
    requestHash,
    mode: "MANUAL",
    now,
  });

  if (reservation.kind === "replay") {
    return { replayed: true, value: { lessonId: reservation.lessonId } };
  }
  if (reservation.kind === "pending") {
    throw new OutcomePendingError(reservation.retryAfterSeconds);
  }

  const { lessonId } = await commitLessonGraph({
    requestId: reservation.requestId,
    userId: input.userId,
    role: input.role,
    courseId: input.request.courseId,
    draft: {
      title: input.request.title,
      topic: input.request.topic,
      cefrLevel: input.request.cefrLevel,
      learningObjectives: input.request.learningObjectives,
      transcript: input.request.transcript,
      audioUrl: input.request.audioUrl,
      accent: input.request.accent,
      defaultPlaybackRate: input.request.defaultPlaybackRate,
      estimatedMinutes: input.request.estimatedMinutes,
      segments: input.request.segments,
      exercises: input.request.exercises,
      vocabulary: input.request.vocabulary,
    },
    source: "manual",
  });

  return { replayed: false, value: { lessonId } };
}

export async function generateLessonFromRequest(input: {
  userId: string;
  role: "TEACHER" | "ADMIN";
  clientRequestId: string;
  request: GenerateLessonInput;
}): Promise<IdempotentResult<{ lessonId: string }>> {
  const now = new Date();
  const startTime = Date.now();
  const requestHash = hashCanonicalPayload({
    topic: input.request.topic,
    cefrLevel: input.request.cefrLevel,
    learningObjectives: input.request.learningObjectives,
    targetVocabulary: input.request.targetVocabulary ?? null,
    targetGrammar: input.request.targetGrammar ?? null,
    audioDuration: input.request.audioDuration ?? null,
    accent: input.request.accent ?? null,
    difficulty: input.request.difficulty ?? null,
  });

  const reservation = await reserveLessonCreationRequest({
    userId: input.userId,
    clientRequestId: input.clientRequestId,
    requestHash,
    mode: "AI",
    now,
  });

  if (reservation.kind === "replay") {
    return { replayed: true, value: { lessonId: reservation.lessonId } };
  }
  if (reservation.kind === "pending") {
    throw new OutcomePendingError(reservation.retryAfterSeconds);
  }

  const aiProvider = createAIProviderFromEnv();
  const aiBudgetReservation = await reserveUserAICall({
    userId: input.userId,
    purpose: "lesson_generation",
    provider: aiProvider.providerName,
    model: aiProvider.modelName,
  });

  let rawDraft;
  try {
    rawDraft = await aiProvider.generateLesson({
      ...input.request,
      safetyIdentifier: input.userId,
    });
  } catch (error) {
    await settleUserAICall(aiBudgetReservation, {
      success: false,
      provider: aiProvider.providerName,
      model: aiProvider.modelName,
      failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
    });

    await prisma.lessonCreationRequest.update({
      where: { id: reservation.requestId },
      data: {
        status: "FAILED",
        errorCode: isAIProviderError(error) ? error.code : "PROVIDER_ERROR",
      },
    }).catch(() => {});

    throw error;
  }

  const validated = AILessonDraftSchema.safeParse(rawDraft);
  if (!validated.success) {
    await settleUserAICall(aiBudgetReservation, {
      success: false,
      provider: aiProvider.providerName,
      model: aiProvider.modelName,
      failureReason: "schema_validation_failed",
    });

    await prisma.lessonCreationRequest.update({
      where: { id: reservation.requestId },
      data: {
        status: "FAILED",
        errorCode: "VALIDATION_FAILED",
      },
    }).catch(() => {});

    throw new Error("AI tạo nội dung không hợp lệ, vui lòng thử lại");
  }

  const aiTrace = {
    provider: aiProvider.providerName,
    model: aiProvider.modelName,
    inputHash: requestHash,
    validatedOutput: JSON.stringify({
      title: validated.data.title,
      cefrLevel: input.request.cefrLevel,
      segmentCount: validated.data.segments.length,
      exerciseCount: validated.data.exercises.length,
    }),
    latencyMs: Date.now() - startTime,
  };

  const { lessonId } = await commitLessonGraph({
    requestId: reservation.requestId,
    userId: input.userId,
    role: input.role,
    draft: {
      title: validated.data.title,
      topic: input.request.topic,
      cefrLevel: input.request.cefrLevel,
      learningObjectives: input.request.learningObjectives,
      transcript: validated.data.transcript,
      estimatedMinutes: input.request.audioDuration ?? 10,
      segments: validated.data.segments,
      exercises: validated.data.exercises,
      vocabulary: validated.data.vocabulary,
    },
    source: "ai",
    aiTrace,
  });

  try {
    await settleUserAICall(aiBudgetReservation, {
      success: true,
      provider: aiProvider.providerName,
      model: aiProvider.modelName,
    });
  } catch (settleError) {
    logger.warn({ err: settleError, lessonId }, "Failed to settle AI budget after successful lesson commit");
  }

  return { replayed: false, value: { lessonId } };
}

export async function publishLesson(input: {
  lessonId: string;
  userId: string;
  role: "TEACHER" | "ADMIN";
}): Promise<{ status: "PUBLISHED" }> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    include: {
      segments: true,
      exercises: true,
      vocabulary: true,
    },
  });

  if (!lesson) {
    throw new Error("Lesson not found");
  }
  if (lesson.createdById !== input.userId && input.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const targetVocabCount = lesson.vocabulary.filter((v) => Boolean(v.isTarget)).length;

  if (
    lesson.segments.length < 1 ||
    lesson.exercises.length < 1 ||
    targetVocabCount < 1
  ) {
    throw new LessonGraphIncompleteError(
      `Lesson cannot be published: graph requires >=1 segment, >=1 exercise, and >=1 target vocabulary item (found ${lesson.segments.length} segments, ${lesson.exercises.length} exercises, ${targetVocabCount} target vocabulary)`
    );
  }

  await prisma.lesson.update({
    where: { id: input.lessonId },
    data: {
      status: "PUBLISHED",
      reviewedById: input.userId,
    },
  });

  logger.info({ lessonId: input.lessonId, userId: input.userId }, "Lesson published");
  return { status: "PUBLISHED" };
}
