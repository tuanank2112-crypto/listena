import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { execFileSync } from "node:child_process";
import { closeSync, openSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAtomicLibSqlClient, prisma } from "@/lib/prisma";
import { submitAttempt } from "./learning";
import { LegacyResultUnavailableError } from "@/lib/idempotency";

/**
 * Plan13 SPEC-P132 §1/§3/§4 on a real temporary SQLite database: mastery
 * direction (L1), Unicode normalization end-to-end (L3), lesson binding (L4),
 * flashcard reuse (L5), receipt ids, expected-only vocabulary, and the
 * deterministic finalize of a stale PENDING enrichment (L6/D1).
 */
describe("Plan13 P132 — Real SQLite learning correctness", () => {
  let tempDir: string;
  let dbPath: string;
  let originalDbUrl: string | undefined;

  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    tempDir = mkdtempSync(path.join(tmpdir(), "listenai-p132-"));
    dbPath = path.join(tempDir, "test.db").replaceAll("\\", "/");
    process.env.DATABASE_URL = `file:${dbPath}`;

    // Prisma's Windows schema engine requires a file before migrate deploy.
    closeSync(openSync(path.join(tempDir, "test.db"), "a"));

    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: "pipe",
    });

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
      data: { id: "teacher-1", name: "Teacher 1", email: "teacher1@example.com", password: "hash123", role: "TEACHER" },
    });
    await prisma.course.create({
      data: { id: "course-1", title: "A2 English", cefrLevel: "A2", status: "PUBLISHED", createdById: "teacher-1" },
    });

    await prisma.lesson.create({
      data: {
        id: "lesson-1",
        courseId: "course-1",
        title: "Airport Check-in",
        topic: "Travel",
        cefrLevel: "A2",
        transcript: "Welcome to the airport. Please show your passport. Don't forget your ticket.",
        status: "PUBLISHED",
        createdById: "teacher-1",
        segments: { create: [{ id: "seg-1", position: 1, text: "Welcome to the airport.", difficulty: 1.0 }] },
        exercises: {
          create: [
            { id: "ex-welcome", type: "FULL_DICTATION", prompt: "Write", correctAnswer: "Welcome to the airport", position: 1, difficulty: 1.0 },
            { id: "ex-passport", type: "FULL_DICTATION", prompt: "Write", correctAnswer: "Please show your passport", position: 2, difficulty: 1.0 },
            { id: "ex-dont", type: "FULL_DICTATION", prompt: "Write", correctAnswer: "Don't forget your ticket", position: 3, difficulty: 1.0 },
          ],
        },
      },
    });

    await prisma.lesson.create({
      data: {
        id: "lesson-2",
        courseId: "course-1",
        title: "Hotel",
        topic: "Travel",
        cefrLevel: "A2",
        transcript: "I have a reservation.",
        status: "PUBLISHED",
        createdById: "teacher-1",
        exercises: {
          create: [
            { id: "ex-hotel", type: "FULL_DICTATION", prompt: "Write", correctAnswer: "I have a reservation", position: 1, difficulty: 1.0 },
          ],
        },
      },
    });
  }, 60_000);

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

  function attempt(exerciseId: string, submittedAnswer: string, extra: Partial<Parameters<typeof submitAttempt>[0]> = {}) {
    return submitAttempt({
      userId: "learner-1",
      exerciseId,
      lessonId: "lesson-1",
      submittedAnswer,
      completionTimeMs: 1500,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1.0,
      clientAttemptId: randomUUID(),
      ...extra,
    });
  }

  it("L1: a 100% correct dictation raises spelling/vocabulary mastery; a fully wrong one lowers it", async () => {
    const before = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: "learner-1" } });
    const correct = await attempt("ex-welcome", "Welcome to the airport");
    expect(correct.value.assessment.overallScore).toBe(100);
    const afterCorrect = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: "learner-1" } });
    expect(afterCorrect.spellingMastery).toBeGreaterThan(before.spellingMastery);
    expect(afterCorrect.vocabularyMastery).toBeGreaterThan(before.vocabularyMastery);

    const skill = await prisma.skillMastery.findUniqueOrThrow({
      where: { userId_skillKey: { userId: "learner-1", skillKey: "spelling" } },
    });
    expect(skill.masteryScore).toBeGreaterThan(0.5);

    await attempt("ex-welcome", "zzz qqq");
    const afterWrong = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: "learner-1" } });
    expect(afterWrong.spellingMastery).toBeLessThan(afterCorrect.spellingMastery);
    expect(afterWrong.vocabularyMastery).toBeLessThan(afterCorrect.vocabularyMastery);
  });

  it("L3: a typographic apostrophe scores as the ASCII answer and creates no bogus vocabulary", async () => {
    const result = await attempt("ex-dont", "Don’t forget your ticket");
    expect(result.value.assessment.overallScore).toBe(100);
    expect(result.value.assessment.errors).toEqual([]);
    expect(await prisma.vocabularyItem.findUnique({ where: { lemma: "don" } })).toBeNull();
    expect(await prisma.vocabularyItem.findUnique({ where: { lemma: "t" } })).toBeNull();
  });

  it("L4: an exercise from another lesson is rejected and nothing is written", async () => {
    const clientAttemptId = randomUUID();
    await expect(attempt("ex-hotel", "I have a reservation", { clientAttemptId }))
      .rejects.toThrow("Exercise does not belong to the lesson");
    expect(await prisma.attempt.findMany({ where: { clientAttemptId } })).toHaveLength(0);
    expect(await prisma.attempt.findMany({ where: { userId: "learner-1", lessonId: "lesson-1", exerciseId: "ex-hotel" } })).toHaveLength(0);
  });

  it("L5 + receipt ids: repeated misses of the same word reuse one active flashcard and the replay returns its id", async () => {
    const clientAttemptId = randomUUID();
    const first = await attempt("ex-passport", "Please show your visa", { clientAttemptId });
    expect(first.replayed).toBe(false);
    expect(first.value.flashcardIds).toHaveLength(1);
    const [cardId] = first.value.flashcardIds;

    const second = await attempt("ex-passport", "Please show your ticket");
    expect(second.value.flashcardIds).toEqual([cardId]);

    const item = await prisma.vocabularyItem.findUniqueOrThrow({ where: { lemma: "passport" } });
    const cards = await prisma.flashcard.findMany({ where: { userId: "learner-1", vocabularyItemId: item.id, active: true } });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(cardId);

    // The receipt was serialized after the ids were resolved: replay carries them.
    const replay = await attempt("ex-passport", "Please show your visa", { clientAttemptId });
    expect(replay.replayed).toBe(true);
    expect(replay.value.flashcardIds).toEqual([cardId]);
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: first.value.attemptId } });
    expect(JSON.parse(row.resultJson ?? "{}").result.flashcardIds).toEqual([cardId]);
  });

  it("extra words typed by the learner never become VocabularyItems or flashcards", async () => {
    const result = await attempt("ex-welcome", "Welcome to the airport blorpish");
    expect(result.value.assessment.errors.some((error) => error.type === "EXTRA_WORD")).toBe(true);
    expect(result.value.flashcardIds).toEqual([]);
    expect(await prisma.vocabularyItem.findUnique({ where: { lemma: "blorpish" } })).toBeNull();
    expect(await prisma.flashcard.findMany({ where: { sourceAttemptId: result.value.attemptId } })).toHaveLength(0);
  });

  it("persists confidence and assistMode when supplied, NULL otherwise", async () => {
    const withBet = await attempt("ex-welcome", "Welcome to the airport", { confidence: 3, assistMode: "SKELETON" });
    const betRow = await prisma.attempt.findUniqueOrThrow({ where: { id: withBet.value.attemptId } });
    expect(betRow.confidence).toBe(3);
    expect(betRow.assistMode).toBe("SKELETON");

    const plain = await attempt("ex-welcome", "Welcome to the airport");
    const plainRow = await prisma.attempt.findUniqueOrThrow({ where: { id: plain.value.attemptId } });
    expect(plainRow.confidence).toBeNull();
    expect(plainRow.assistMode).toBeNull();
  });

  it("L6/D1: a PENDING attempt past its lease is finalized deterministically (SKIPPED) and replays 200 thereafter", async () => {
    const clientAttemptId = randomUUID();
    const first = await attempt("ex-passport", "Please show your visa", { clientAttemptId });
    // Simulate the crash between core commit and enrichment finalize.
    await prisma.attempt.update({
      where: { id: first.value.attemptId },
      data: {
        resultJson: null,
        enrichmentState: "PENDING",
        enrichmentLeaseId: "lease-crashed",
        enrichmentLeaseExpiresAt: new Date(Date.now() - 5_000),
      },
    });

    const replay = await attempt("ex-passport", "Please show your visa", { clientAttemptId });
    expect(replay.replayed).toBe(true);
    expect(replay.value.attemptId).toBe(first.value.attemptId);
    expect(replay.value.aiFeedbackStatus).toBe("unavailable");
    expect(replay.value.assessment.overallScore).toBe(first.value.assessment.overallScore);
    expect(replay.value.assessment.errors).toEqual(first.value.assessment.errors);
    expect(replay.value.flashcardIds).toEqual(first.value.flashcardIds);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: first.value.attemptId } });
    expect(row.enrichmentState).toBe("SKIPPED");
    expect(row.resultJson).toBeTruthy();

    const again = await attempt("ex-passport", "Please show your visa", { clientAttemptId });
    expect(again.replayed).toBe(true);
    expect(again.value).toEqual(replay.value);
  });

  it("D1: a finalize that does not affect exactly one row raises LegacyResultUnavailableError (no silent success)", async () => {
    const clientAttemptId = randomUUID();
    const first = await attempt("ex-welcome", "Welcome to the airport", { clientAttemptId });
    await prisma.attempt.update({
      where: { id: first.value.attemptId },
      data: {
        resultJson: null,
        enrichmentState: "PENDING",
        enrichmentLeaseId: "lease-stale",
        enrichmentLeaseExpiresAt: new Date(Date.now() - 5_000),
      },
    });

    const client = getAtomicLibSqlClient();
    const origTransaction = client.transaction.bind(client);
    const transactionSpy = vi.spyOn(client, "transaction").mockImplementation(async (mode?: "write" | "read" | "deferred") => {
      const tx = await origTransaction(mode);
      const origExecute = tx.execute.bind(tx);
      tx.execute = async (stmt) => {
        const sql = typeof stmt === "string" ? stmt : stmt.sql;
        if (/UPDATE\s+"Attempt"/i.test(sql)) {
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

    try {
      await expect(attempt("ex-welcome", "Welcome to the airport", { clientAttemptId }))
        .rejects.toThrow(LegacyResultUnavailableError);
    } finally {
      transactionSpy.mockRestore();
    }

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: first.value.attemptId } });
    expect(row.enrichmentState).toBe("PENDING");
    expect(row.resultJson).toBeNull();

    // Without the fault the same replay finalizes normally.
    const recovered = await attempt("ex-welcome", "Welcome to the airport", { clientAttemptId });
    expect(recovered.replayed).toBe(true);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: first.value.attemptId } })).enrichmentState).toBe("SKIPPED");
  });
});
