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
  type AICallReservation,
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

/**
 * Plan13 SPEC-P131 §1/§5: the AI lease must outlive the 180s provider call.
 * Manual creation has no upstream call and keeps a short lease.
 */
export const LESSON_CREATION_AI_LEASE_MS = 210_000;
export const LESSON_CREATION_MANUAL_LEASE_MS = 30_000;

/**
 * AI4: a PENDING row whose lease expired can never be committed (every graph
 * write requires PENDING under a live request), so it is reclaimed as FAILED
 * by compare-and-swap. Returns the row as it should be treated afterwards.
 */
async function reclaimExpiredLease<T extends { id: string; status: string; leaseExpiresAt: Date }>(
  existing: T,
  now: Date,
): Promise<T> {
  if (existing.status !== "PENDING" || existing.leaseExpiresAt.getTime() >= now.getTime()) {
    return existing;
  }
  const expired = await prisma.lessonCreationRequest.updateMany({
    where: { id: existing.id, status: "PENDING", leaseExpiresAt: { lt: now } },
    data: { status: "FAILED", errorCode: "LEASE_EXPIRED" },
  });
  return expired.count === 1 ? { ...existing, status: "FAILED", errorCode: "LEASE_EXPIRED" } : existing;
}

/** D5: ledger writes after a claim only ever move a row that is still PENDING. */
async function markPendingRequest(
  requestId: string,
  status: "FAILED" | "UNKNOWN",
  errorCode: string,
) {
  try {
    await prisma.lessonCreationRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status, errorCode },
    });
  } catch (error) {
    logger.warn({ err: error, requestId, status }, "Could not update lesson creation ledger");
  }
}

export async function reserveLessonCreationRequest(input: {
  userId: string;
  clientRequestId: string;
  requestHash: string;
  mode: "MANUAL" | "AI";
  now: Date;
}): Promise<ReserveResult> {
  const found = await prisma.lessonCreationRequest.findUnique({
    where: {
      userId_clientRequestId: {
        userId: input.userId,
        clientRequestId: input.clientRequestId,
      },
    },
  });
  const existing = found ? await reclaimExpiredLease(found, input.now) : null;

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
  const leaseDurationMs = input.mode === "AI"
    ? LESSON_CREATION_AI_LEASE_MS
    : LESSON_CREATION_MANUAL_LEASE_MS;
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
    const recheckedRow = await prisma.lessonCreationRequest.findUnique({
      where: {
        userId_clientRequestId: {
          userId: input.userId,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    const rechecked = recheckedRow ? await reclaimExpiredLease(recheckedRow, input.now) : null;
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
      if (rechecked.status === "FAILED") {
        const reclaimed = await prisma.lessonCreationRequest.updateMany({
          where: { id: rechecked.id, status: "FAILED" },
          data: { status: "PENDING", leaseExpiresAt, errorCode: null },
        });
        if (reclaimed.count === 1) return { kind: "reserved", requestId: rechecked.id };
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
    // If the atomic commit fails, mark the ledger UNKNOWN for AI mode or
    // FAILED for manual. Guarded on PENDING (D5): a transaction that did
    // commit but lost its response has already moved the row to COMMITTED,
    // and that row must keep its lessonId.
    await markPendingRequest(
      input.requestId,
      input.source === "ai" ? "UNKNOWN" : "FAILED",
      "BATCH_COMMIT_FAILED",
    );
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

  // AI3: from here on the ledger row is PENDING. Every step that can fail
  // (provider configuration, the per-user AI budget, the call itself,
  // validation, the graph commit) must move it to FAILED/UNKNOWN, or the
  // teacher's clientRequestId stays "pending" for the whole lease.
  let aiProvider: ReturnType<typeof createAIProviderFromEnv>;
  let aiBudgetReservation: AICallReservation;
  try {
    aiProvider = createAIProviderFromEnv();
    aiBudgetReservation = await reserveUserAICall({
      userId: input.userId,
      purpose: "lesson_generation",
      provider: aiProvider.providerName,
      model: aiProvider.modelName,
    });
  } catch (error) {
    await markPendingRequest(
      reservation.requestId,
      "FAILED",
      isAIProviderError(error) ? error.code : "PROVIDER_ERROR",
    );
    throw error;
  }

  // Once reserved, the AI budget lease is settled exactly once on every path
  // (success, provider failure, validation failure, commit failure).
  let settled = false;
  const settleBudget = async (outcome: Parameters<typeof settleUserAICall>[1]) => {
    if (settled) return;
    settled = true;
    try {
      await settleUserAICall(aiBudgetReservation, {
        provider: aiProvider.providerName,
        model: aiProvider.modelName,
        ...outcome,
      });
    } catch (settleError) {
      logger.warn({ err: settleError, requestId: reservation.requestId }, "Failed to settle AI budget for lesson generation");
    }
  };

  try {
    let rawDraft;
    try {
      rawDraft = await aiProvider.generateLesson({
        ...input.request,
        safetyIdentifier: input.userId,
      });
    } catch (error) {
      await settleBudget({
        success: false,
        failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
      });
      await markPendingRequest(
        reservation.requestId,
        "FAILED",
        isAIProviderError(error) ? error.code : "PROVIDER_ERROR",
      );
      throw error;
    }

    const validated = AILessonDraftSchema.safeParse(rawDraft);
    if (!validated.success) {
      await settleBudget({ success: false, failureReason: "schema_validation_failed" });
      await markPendingRequest(reservation.requestId, "FAILED", "VALIDATION_FAILED");
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

    // The upstream call succeeded and is billed whether or not the commit
    // below succeeds, so the reservation settles as a success here.
    await settleBudget({ success: true });

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

    return { replayed: false, value: { lessonId } };
  } finally {
    // Any path that escaped without settling (an unexpected throw between
    // the provider call and settle) must not leave a 210s PENDING lease.
    await settleBudget({ success: false, failureReason: "unknown" });
  }
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
