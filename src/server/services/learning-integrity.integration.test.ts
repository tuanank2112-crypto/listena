import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { execFileSync } from "node:child_process";
import { closeSync, openSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAtomicLibSqlClient, prisma } from "@/lib/prisma";
import {
  submitAttempt,
  reviewFlashcard,
  type SubmitAttemptResult,
} from "./learning";
import {
  publishLesson,
  LessonGraphIncompleteError,
} from "./lesson-authoring";
import { type IdempotentResult, OutcomePendingError } from "@/lib/idempotency";

describe("Plan 11 — Real SQLite Learning & Authoring Integrity (P111/P112)", () => {
  let tempDir: string;
  let dbPath: string;
  let originalDbUrl: string | undefined;

  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    tempDir = mkdtempSync(path.join(tmpdir(), "listenai-p11-"));
    dbPath = path.join(tempDir, "test.db").replaceAll("\\", "/");
    process.env.DATABASE_URL = `file:${dbPath}`;

    // Prisma's Windows schema engine requires a file before migrate deploy.
    closeSync(openSync(path.join(tempDir, "test.db"), "a"));

    // Deploy migrations to fresh temporary database
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: "pipe",
    });

    // Seed baseline fixtures
    await prisma.user.create({
      data: {
        id: "learner-1",
        name: "Learner 1",
        email: "learner1@example.com",
        password: "hash123",
        role: "LEARNER",
        learnerProfile: {
          create: {
            estimatedCefrLevel: "A2",
            listeningMastery: 0.5,
            vocabularyMastery: 0.5,
            spellingMastery: 0.5,
            totalStudyMinutes: 10,
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        id: "teacher-1",
        name: "Teacher 1",
        email: "teacher1@example.com",
        password: "hash123",
        role: "TEACHER",
      },
    });

    await prisma.course.create({
      data: {
        id: "course-1",
        title: "A2 English",
        cefrLevel: "A2",
        status: "PUBLISHED",
        createdById: "teacher-1",
      },
    });

    await prisma.lesson.create({
      data: {
        id: "lesson-1",
        courseId: "course-1",
        title: "Airport Check-in",
        topic: "Travel",
        cefrLevel: "A2",
        transcript: "Welcome to the airport. Please show your passport.",
        status: "PUBLISHED",
        createdById: "teacher-1",
        segments: {
          create: [
            { id: "seg-1", position: 1, text: "Welcome to the airport.", difficulty: 1.0 },
          ],
        },
        exercises: {
          create: [
            {
              id: "ex-1",
              type: "FULL_DICTATION",
              prompt: "Write what you hear",
              correctAnswer: "Welcome to the airport",
              position: 1,
              difficulty: 1.0,
            },
            {
              id: "ex-passport",
              type: "FULL_DICTATION",
              prompt: "Write what you hear",
              correctAnswer: "Please show your passport",
              position: 2,
              difficulty: 1.0,
            },
          ],
        },
      },
    });

    await prisma.vocabularyItem.create({
      data: {
        id: "vocab-passport",
        lemma: "passport",
        displayText: "passport",
        meaningVi: "hộ chiếu",
        cefrLevel: "A2",
      },
    });

    await prisma.lessonVocabulary.create({
      data: {
        lessonId: "lesson-1",
        vocabularyItemId: "vocab-passport",
        isTarget: true,
        importance: 1.0,
      },
    });

    await prisma.vocabularyMastery.create({
      data: {
        id: "vm-passport",
        userId: "learner-1",
        vocabularyItemId: "vocab-passport",
        masteryScore: 0.5,
        revision: 1,
        incorrectCount: 0,
        correctCount: 0,
      },
    });

    await prisma.flashcard.create({
      data: {
        id: "fc-passport",
        userId: "learner-1",
        vocabularyItemId: "vocab-passport",
        front: "passport",
        back: "hộ chiếu",
        active: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows
    }
  });

  it("T111-01: 20 concurrent same-key attempt requests produce exactly 1 receipt and 0 generic 500s", async () => {
    const clientAttemptId = randomUUID();
    const payload = {
      userId: "learner-1",
      exerciseId: "ex-1",
      lessonId: "lesson-1",
      submittedAnswer: "Welcome to the airport",
      completionTimeMs: 2500,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1.0,
      clientAttemptId,
    };

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => submitAttempt(payload))
    );

    // Assert 0 unhandled rejections / generic 500s
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);

    const fulfilled = results
      .filter((r): r is PromiseFulfilledResult<IdempotentResult<SubmitAttemptResult>> => r.status === "fulfilled")
      .map((r) => r.value);
    const winners = fulfilled.filter((res) => res.replayed === false);
    const replays = fulfilled.filter((res) => res.replayed === true);

    expect(winners).toHaveLength(1);
    expect(replays).toHaveLength(19);

    // Verify deep payload equality between winner and replay
    const winnerValue = winners[0].value;
    for (const replay of replays) {
      expect(replay.value.attemptId).toBe(winnerValue.attemptId);
      expect(replay.value.attempt.score).toBe(winnerValue.attempt.score);
      expect(replay.value.assessment.overallScore).toBe(winnerValue.assessment.overallScore);
      expect(replay.value.assessment.spellingAccuracy).toBe(winnerValue.assessment.spellingAccuracy);
      expect(replay.value.assessment.wordDiffs).toEqual(winnerValue.assessment.wordDiffs);
    }

    // Assert exactly 1 row in the database
    const attempts = await prisma.attempt.findMany({
      where: { clientAttemptId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].resultJson).toBeTruthy();
  });

  it("T111-02a: 2 concurrent reviews with different keys serialize cleanly on real SQLite and both commit", async () => {
    const fcBefore = await prisma.flashcard.findUniqueOrThrow({
      where: { id: "fc-passport" },
    });
    const masteryBefore = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    const currentRev = masteryBefore.revision;

    const id1 = randomUUID();
    const id2 = randomUUID();

    const [res1, res2] = await Promise.allSettled([
      reviewFlashcard({
        userId: "learner-1",
        flashcardId: fcBefore.id,
        rating: "GOOD",
        responseTimeMs: 1200,
        clientReviewId: id1,
      }),
      reviewFlashcard({
        userId: "learner-1",
        flashcardId: fcBefore.id,
        rating: "EASY",
        responseTimeMs: 900,
        clientReviewId: id2,
      }),
    ]);

    const successCount = [res1, res2].filter((r) => r.status === "fulfilled").length;
    expect(successCount).toBe(2);

    const log1 = await prisma.reviewLog.findMany({ where: { clientReviewId: id1 } });
    const log2 = await prisma.reviewLog.findMany({ where: { clientReviewId: id2 } });
    expect(log1).toHaveLength(1);
    expect(log2).toHaveLength(1);

    const masteryAfter = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    expect(masteryAfter.revision).toBe(currentRev + 2);

    // Replaying same key returns deep-equal receipt
    const replay1 = await reviewFlashcard({
      userId: "learner-1",
      flashcardId: fcBefore.id,
      rating: "GOOD",
      responseTimeMs: 1200,
      clientReviewId: id1,
    });
    expect(replay1.replayed).toBe(true);
    if (res1.status === "fulfilled") {
      expect(replay1.value).toEqual(res1.value.value);
    }
  });

  it("T111-02b: Fault-injected stale CAS causes rollback, persists ZERO logs, and preserves revision", async () => {
    const fc = await prisma.flashcard.findUniqueOrThrow({
      where: { id: "fc-passport" },
    });
    const masteryBefore = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    const revBefore = masteryBefore.revision;

    const staleReviewId = randomUUID();

    // Fault-injection: intercept write transaction and simulate rowsAffected = 0 on UPDATE VocabularyMastery
    const client = getAtomicLibSqlClient();
    const origTransaction = client.transaction.bind(client);

    const transactionSpy = vi.spyOn(client, "transaction").mockImplementation(async (mode?: "write" | "read" | "deferred") => {
      const tx = await origTransaction(mode);
      const origExecute = tx.execute.bind(tx);
      tx.execute = async (stmt) => {
        const sql = typeof stmt === "string" ? stmt : stmt.sql;
        if (/UPDATE\s+"VocabularyMastery"/i.test(sql)) {
          // Simulate CAS mismatch: 0 rows affected
          return {
            columns: [],
            columnTypes: [],
            rows: [],
            rowsAffected: 0,
            lastInsertRowid: undefined,
            toJSON: () => ({ columns: [], columnTypes: [], rows: [], rowsAffected: 0 }),
          };
        }
        return origExecute(stmt);
      };
      return tx;
    });

    let caughtError: unknown;
    try {
      await reviewFlashcard({
        userId: "learner-1",
        flashcardId: fc.id,
        rating: "AGAIN",
        responseTimeMs: 1500,
        clientReviewId: staleReviewId,
      });
    } catch (err) {
      caughtError = err;
    } finally {
      transactionSpy.mockRestore();
    }

    expect(caughtError).toBeInstanceOf(OutcomePendingError);

    // Assert that the transaction rolled back: ZERO ReviewLog for staleReviewId
    const staleLogs = await prisma.reviewLog.findMany({
      where: { clientReviewId: staleReviewId },
    });
    expect(staleLogs).toHaveLength(0);

    // Assert revision did not change
    const masteryAfter = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    expect(masteryAfter.revision).toBe(revBefore);
  });

  it("T111-03a: 5 correct attempts do NOT increment VocabularyMastery.revision", async () => {
    const masteryBefore = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    const startRevision = masteryBefore.revision;

    for (let i = 0; i < 5; i++) {
      const res = await submitAttempt({
        userId: "learner-1",
        exerciseId: "ex-1",
        lessonId: "lesson-1",
        submittedAnswer: "Welcome to the airport",
        completionTimeMs: 1500 + i * 100,
        replayCount: 0,
        hintCount: 0,
        playbackRate: 1.0,
        clientAttemptId: randomUUID(),
      });
      expect(res.replayed).toBe(false);
    }

    const masteryAfter = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    expect(masteryAfter.revision).toBe(startRevision);
  });

  it("T111-03b: 5 incorrect attempts touching target vocabulary increment revision on each attempt", async () => {
    const masteryBefore = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    const startRevision = masteryBefore.revision;
    const startIncorrect = masteryBefore.incorrectCount;

    for (let i = 0; i < 5; i++) {
      const res = await submitAttempt({
        userId: "learner-1",
        exerciseId: "ex-passport",
        lessonId: "lesson-1",
        submittedAnswer: "Please show your luggage",
        completionTimeMs: 1600 + i * 50,
        replayCount: 0,
        hintCount: 0,
        playbackRate: 1.0,
        clientAttemptId: randomUUID(),
      });
      expect(res.replayed).toBe(false);
    }

    const masteryAfter = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    expect(masteryAfter.revision).toBe(startRevision + 5);
    expect(masteryAfter.incorrectCount).toBe(startIncorrect + 5);
  });

  it("T111-04: Interleaved incorrect attempt and review guard all writers without stale overwrite", async () => {
    const masteryBefore = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    const startRevision = masteryBefore.revision;

    // Writer 1: Attempt (incorrect, touches passport)
    await submitAttempt({
      userId: "learner-1",
      exerciseId: "ex-passport",
      lessonId: "lesson-1",
      submittedAnswer: "Please show your bag",
      completionTimeMs: 1200,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1.0,
      clientAttemptId: randomUUID(),
    });

    // Writer 2: Review flashcard
    await reviewFlashcard({
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "GOOD",
      responseTimeMs: 800,
      clientReviewId: randomUUID(),
    });

    // Writer 3: Attempt (incorrect, touches passport)
    await submitAttempt({
      userId: "learner-1",
      exerciseId: "ex-passport",
      lessonId: "lesson-1",
      submittedAnswer: "Please show your ticket",
      completionTimeMs: 1300,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1.0,
      clientAttemptId: randomUUID(),
    });

    // Writer 4: Review flashcard
    await reviewFlashcard({
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "EASY",
      responseTimeMs: 700,
      clientReviewId: randomUUID(),
    });

    const masteryAfter = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    expect(masteryAfter.revision).toBe(startRevision + 4);
  });

  it("T111-05: First / replay deep equality holds", async () => {
    const clientAttemptId = randomUUID();
    const payload = {
      userId: "learner-1",
      exerciseId: "ex-1",
      lessonId: "lesson-1",
      submittedAnswer: "Welcome to the airport",
      completionTimeMs: 3100,
      replayCount: 1,
      hintCount: 0,
      playbackRate: 0.8,
      clientAttemptId,
    };

    const first = await submitAttempt(payload);
    expect(first.replayed).toBe(false);

    const replay = await submitAttempt(payload);
    expect(replay.replayed).toBe(true);

    expect(replay.value.attemptId).toEqual(first.value.attemptId);
    expect(replay.value.attempt.score).toEqual(first.value.attempt.score);
    expect(replay.value.assessment.overallScore).toEqual(first.value.assessment.overallScore);
    expect(replay.value.assessment.wordDiffs).toEqual(first.value.assessment.wordDiffs);
    expect(replay.value.assessment.errors).toEqual(first.value.assessment.errors);
  });

  it("T111-01 (review variant): 20 concurrent reviews with same clientReviewId -> deduplicate to 1 ReviewLog and return identical receipt", async () => {
    const clientReviewId = randomUUID();
    const payload = {
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "GOOD" as const,
      responseTimeMs: 1200,
      clientReviewId,
    };

    const initialRevision = (await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    })).revision;

    const promises = Array.from({ length: 20 }, () => reviewFlashcard(payload));
    const results = await Promise.all(promises);

    // Exactly 1 new ReviewLog
    const logs = await prisma.reviewLog.findMany({
      where: { userId: "learner-1", clientReviewId },
    });
    expect(logs.length).toBe(1);

    // Mastery revision bumped exactly by 1
    const finalMastery = await prisma.vocabularyMastery.findUniqueOrThrow({
      where: { id: "vm-passport" },
    });
    expect(finalMastery.revision).toBe(initialRevision + 1);

    // Exactly one caller had replayed: false, exactly 19 had replayed: true
    const freshCount = results.filter((r) => !r.replayed).length;
    const replayCount = results.filter((r) => r.replayed).length;
    expect(freshCount).toBe(1);
    expect(replayCount).toBe(19);

    // All 20 received the exact same reviewLogId and schedule
    const firstVal = results[0]!.value;
    for (const r of results) {
      expect(r.value.reviewLogId).toBe(firstVal.reviewLogId);
      expect(r.value.intervalDays).toBe(firstVal.intervalDays);
      expect(r.value.nextReviewAt).toBe(firstVal.nextReviewAt);
      expect(r.value.repetitionCount).toBe(firstVal.repetitionCount);
    }
  });

  it("T111-01 (unique conflict -> readback): race against committed row returns receipt without 500 error", async () => {
    const clientReviewId = randomUUID();
    const payload = {
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "EASY" as const,
      responseTimeMs: 900,
      clientReviewId,
    };

    // First normal execution
    const firstRes = await reviewFlashcard(payload);
    expect(firstRes.replayed).toBe(false);

    // Second call triggers existing check / readback
    const secondRes = await reviewFlashcard(payload);
    expect(secondRes.replayed).toBe(true);
    expect(secondRes.value.reviewLogId).toBe(firstRes.value.reviewLogId);
    expect(secondRes.value.intervalDays).toBe(firstRes.value.intervalDays);
  });

  it("T111-05 (extension 1): Replay attempt after review of vocabulary and after unpublish lesson returns original receipt", async () => {
    const clientAttemptId = randomUUID();
    const payload = {
      userId: "learner-1",
      exerciseId: "ex-passport",
      lessonId: "lesson-1",
      submittedAnswer: "Please show your visa", // error on "passport"
      completionTimeMs: 4000,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1.0,
      clientAttemptId,
    };

    const first = await submitAttempt(payload);
    expect(first.replayed).toBe(false);

    // Review the flashcard for passport to alter VocabularyMastery
    await reviewFlashcard({
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "GOOD",
      clientReviewId: randomUUID(),
    });

    // Unpublish lesson-1
    await prisma.lesson.update({
      where: { id: "lesson-1" },
      data: { status: "DRAFT" },
    });

    // Replay attempt with same payload
    const replay = await submitAttempt(payload);
    expect(replay.replayed).toBe(true);
    expect(replay.value.attemptId).toBe(first.value.attemptId);
    expect(replay.value.attempt.score).toBe(first.value.attempt.score);
    expect(replay.value.assessment.overallScore).toBe(first.value.assessment.overallScore);
    expect(replay.value.assessment.errors).toEqual(first.value.assessment.errors);

    // Restore lesson-1 status
    await prisma.lesson.update({
      where: { id: "lesson-1" },
      data: { status: "PUBLISHED" },
    });
  });

  it("T111-05 (extension 2): Replay flashcard review returns original receipt, not latest schedule", async () => {
    const originalReviewId = randomUUID();
    const firstReview = await reviewFlashcard({
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "HARD",
      clientReviewId: originalReviewId,
    });
    expect(firstReview.replayed).toBe(false);
    const originalInterval = firstReview.value.intervalDays;

    // Second subsequent review with DIFFERENT clientReviewId advances schedule
    const secondReview = await reviewFlashcard({
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "EASY",
      clientReviewId: randomUUID(),
    });
    expect(secondReview.replayed).toBe(false);
    expect(secondReview.value.intervalDays).not.toBe(originalInterval);

    // Now replay the FIRST review
    const replayFirst = await reviewFlashcard({
      userId: "learner-1",
      flashcardId: "fc-passport",
      rating: "HARD",
      clientReviewId: originalReviewId,
    });
    expect(replayFirst.replayed).toBe(true);
    expect(replayFirst.value.reviewLogId).toBe(firstReview.value.reviewLogId);
    // CRITICAL: returned interval is the original receipt's interval, NOT secondReview's interval!
    expect(replayFirst.value.intervalDays).toBe(originalInterval);
  });

  it("T111-05 (extension 3): Replay during PENDING enrichment throws OutcomePendingError, returns stable receipt once terminal", async () => {
    const clientAttemptId = randomUUID();
    const payload = {
      userId: "learner-1",
      exerciseId: "ex-1",
      lessonId: "lesson-1",
      submittedAnswer: "Welcome to the airport",
      completionTimeMs: 2500,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1.0,
      clientAttemptId,
    };

    // First attempt creates attempt row
    const first = await submitAttempt(payload);
    expect(first.replayed).toBe(false);

    // Simulate active async enrichment pending with unexpired lease
    await prisma.attempt.update({
      where: { id: first.value.attemptId },
      data: {
        enrichmentState: "PENDING",
        enrichmentLeaseExpiresAt: new Date(Date.now() + 60000),
      },
    });

    // Replay during pending enrichment must throw OutcomePendingError
    await expect(submitAttempt(payload)).rejects.toThrow(OutcomePendingError);

    // Now transition enrichment to terminal state COMPLETED
    await prisma.attempt.update({
      where: { id: first.value.attemptId },
      data: {
        enrichmentState: "COMPLETED",
      },
    });

    // Replay after terminal succeeds and returns stable receipt
    const terminalReplay = await submitAttempt(payload);
    expect(terminalReplay.replayed).toBe(true);
    expect(terminalReplay.value.attemptId).toBe(first.value.attemptId);
    expect(terminalReplay.value.attempt.score).toBe(first.value.attempt.score);
  });

  it("T112-04: Publish rejects lesson with no target vocabulary with 409 LESSON_GRAPH_INCOMPLETE", async () => {
    // Create a draft lesson with segments and exercises, but with only non-target vocabulary
    const draftLesson = await prisma.lesson.create({
      data: {
        id: "draft-lesson-no-target",
        courseId: "course-1",
        title: "Draft Lesson",
        topic: "Test",
        cefrLevel: "A2",
        transcript: "Some text",
        status: "DRAFT",
        createdById: "teacher-1",
        segments: {
          create: [{ position: 1, text: "Some text", difficulty: 1.0 }],
        },
        exercises: {
          create: [
            {
              type: "FULL_DICTATION",
              prompt: "Write",
              correctAnswer: "Some text",
              position: 1,
              difficulty: 1.0,
            },
          ],
        },
        vocabulary: {
          create: [
            {
              vocabularyItemId: "vocab-passport",
              isTarget: false, // NOT A TARGET!
              importance: 1.0,
            },
          ],
        },
      },
    });

    await expect(
      publishLesson({
        lessonId: draftLesson.id,
        userId: "teacher-1",
        role: "TEACHER",
      })
    ).rejects.toThrow(LessonGraphIncompleteError);

    // Verify lesson remains DRAFT
    const stillDraft = await prisma.lesson.findUniqueOrThrow({
      where: { id: draftLesson.id },
    });
    expect(stillDraft.status).toBe("DRAFT");

    // Now update vocabulary to isTarget: true
    await prisma.lessonVocabulary.update({
      where: {
        lessonId_vocabularyItemId: {
          lessonId: draftLesson.id,
          vocabularyItemId: "vocab-passport",
        },
      },
      data: { isTarget: true },
    });

    // Publishing now succeeds!
    const publishRes = await publishLesson({
      lessonId: draftLesson.id,
      userId: "teacher-1",
      role: "TEACHER",
    });
    expect(publishRes.status).toBe("PUBLISHED");

    const nowPublished = await prisma.lesson.findUniqueOrThrow({
      where: { id: draftLesson.id },
    });
    expect(nowPublished.status).toBe("PUBLISHED");
  });
});
