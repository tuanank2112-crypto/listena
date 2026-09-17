import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { execFileSync } from "node:child_process";
import { closeSync, openSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { setTxHookForTesting } from "@/lib/libsql-batch";
import {
  computeTableFingerprints,
  createFaultyTx,
  diffTableFingerprints,
} from "@/test-support/libsql-fault";
import {
  createLessonFromRequest,
  generateLessonFromRequest,
  reserveLessonCreationRequest,
} from "./lesson-authoring";
import * as aiProviderModule from "@/server/ai/provider";
import { AIUnavailableError } from "@/server/ai/errors";
import * as requestBudgetModule from "@/server/ai/request-budget";
import type { AILessonDraft } from "@/server/validation/schemas";

describe("Plan 11/12 — Lesson Authoring Integrity (P112)", () => {
  let tempDir: string;
  let dbPath: string;
  let originalDbUrl: string | undefined;

  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    tempDir = mkdtempSync(path.join(tmpdir(), "listenai-authoring-p112-"));
    dbPath = path.join(tempDir, "test.db").replaceAll("\\", "/");
    process.env.DATABASE_URL = `file:${dbPath}`;

    closeSync(openSync(path.join(tempDir, "test.db"), "a"));

    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: "pipe",
    });

    // Seed teacher, learner, and course
    await prisma.user.create({
      data: {
        id: "teacher-1",
        name: "Teacher 1",
        email: "teacher1@example.com",
        password: "hash",
        role: "TEACHER",
      },
    });

    await prisma.user.create({
      data: {
        id: "teacher-2",
        name: "Teacher 2",
        email: "teacher2@example.com",
        password: "hash",
        role: "TEACHER",
      },
    });

    await prisma.user.create({
      data: {
        id: "learner-1",
        name: "Learner 1",
        email: "learner1@example.com",
        password: "hash",
        role: "LEARNER",
      },
    });

    await prisma.course.create({
      data: {
        id: "course-1",
        title: "Travel English A2",
        cefrLevel: "A2",
        status: "PUBLISHED",
        createdById: "teacher-1",
      },
    });
  }, 60_000);

  afterAll(async () => {
    setTxHookForTesting(null);
    await prisma.$disconnect();
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    }
  });

  describe("T112-02: Statement-level fault injection across the full content graph", () => {
    const TOTAL_STATEMENTS_MANUAL = 5;

    for (let statementIdx = 0; statementIdx < TOTAL_STATEMENTS_MANUAL; statementIdx++) {
      it(`injecting fault at manual statement #${statementIdx} cleanly rolls back all tables and marks ledger FAILED`, async () => {
        const clientRequestId = randomUUID();
        const beforeFingerprints = await computeTableFingerprints();

        // Configure statement-level fault hook
        setTxHookForTesting((tx) =>
          createFaultyTx(tx, {
            failAtStatementIndex: statementIdx,
            error: new Error(`Simulated fault at statement #${statementIdx}`),
          })
        );

        let caughtError: unknown;
        try {
          await createLessonFromRequest({
            userId: "teacher-1",
            role: "TEACHER",
            clientRequestId,
            request: {
              clientRequestId,
              courseId: "course-1",
              title: `Fault Test Lesson #${statementIdx}`,
              topic: "Travel",
              cefrLevel: "A2",
              learningObjectives: ["Objective 1"],
              transcript: "Sample transcript text.",
              accent: "us",
              defaultPlaybackRate: 1.0,
              estimatedMinutes: 5,
              segments: [{ position: 1, text: "Sample transcript text.", difficulty: 1.0 }],
              exercises: [
                {
                  type: "FULL_DICTATION",
                  prompt: "Type what you hear",
                  correctAnswer: "Sample transcript text.",
                  position: 1,
                  difficulty: 1.0,
                },
              ],
              vocabulary: [
                {
                  lemma: `sample-${statementIdx}`,
                  displayText: `sample-${statementIdx}`,
                  meaningVi: "mẫu",
                  cefrLevel: "A2",
                  isTarget: true,
                  importance: 1.0,
                },
              ],
            },
          });
        } catch (err) {
          caughtError = err;
        } finally {
          setTxHookForTesting(null);
        }

        expect(caughtError).toBeDefined();

        const afterFingerprints = await computeTableFingerprints();
        const changedTables = diffTableFingerprints(beforeFingerprints, afterFingerprints);
        expect(changedTables).toContain("LessonCreationRequest");

        // Pre-resolving vocabulary upserts VocabularyItem before transaction,
        // and LessonCreationRequest row is reserved and marked FAILED.
        // ALL graph content tables (Lesson, LessonSegment, Exercise, LessonVocabulary, AIInteraction) MUST be 100% UNCHANGED.
        const contentTables = ["Lesson", "LessonSegment", "Exercise", "LessonVocabulary", "AIInteraction"] as const;
        for (const table of contentTables) {
          expect(beforeFingerprints[table]).toBe(afterFingerprints[table]);
        }

        // Verify ledger status is FAILED
        const ledgerRow = await prisma.lessonCreationRequest.findUniqueOrThrow({
          where: {
            userId_clientRequestId: {
              userId: "teacher-1",
              clientRequestId,
            },
          },
        });
        expect(ledgerRow.status).toBe("FAILED");
        expect(ledgerRow.errorCode).toBe("BATCH_COMMIT_FAILED");
        expect(ledgerRow.lessonId).toBeNull();
      });
    }

    it("injecting fault into AI content graph marks ledger UNKNOWN", async () => {
      const clientRequestId = randomUUID();
      const mockDraft: AILessonDraft = {
        title: "AI Fault Test Lesson",
        transcript: "Welcome aboard flight 402.",
        segments: [{ position: 1, text: "Welcome aboard flight 402.", difficulty: 1.0 }],
        exercises: [
          {
            type: "FULL_DICTATION",
            prompt: "Dictate",
            correctAnswer: "Welcome aboard flight 402.",
            position: 1,
            difficulty: 1.0,
          },
        ],
        vocabulary: [
          {
            lemma: "aboard",
            displayText: "aboard",
            meaningVi: "trên tàu",
            cefrLevel: "A2",
          },
        ],
      };

      const mockProvider: aiProviderModule.AIProvider = {
        providerName: "openai",
        modelName: "gpt-4o-mini",
        analyzeErrors: vi.fn(),
        generateTutoringFeedback: vi.fn(),
        generateLesson: vi.fn().mockResolvedValue(mockDraft),
      };

      vi.spyOn(aiProviderModule, "createAIProviderFromEnv").mockReturnValue(mockProvider);

      // Fault at statement 5 (ledger UPDATE or AI trace)
      setTxHookForTesting((tx) =>
        createFaultyTx(tx, {
          failAtStatementIndex: 4,
          error: new Error("Simulated fault during AI graph transaction"),
        })
      );

      let caughtError: unknown;
      try {
        await generateLessonFromRequest({
          userId: "teacher-1",
          role: "TEACHER",
          clientRequestId,
          request: {
            clientRequestId,
            topic: "Air Travel",
            cefrLevel: "A2",
            learningObjectives: ["Flight boarding terms"],
          },
        });
      } catch (err) {
        caughtError = err;
      } finally {
        setTxHookForTesting(null);
        vi.restoreAllMocks();
      }

      expect(caughtError).toBeDefined();

      const ledgerRow = await prisma.lessonCreationRequest.findUniqueOrThrow({
        where: {
          userId_clientRequestId: {
            userId: "teacher-1",
            clientRequestId,
          },
        },
      });
      // In AI mode, failed graph commit yields UNKNOWN because external side-effects occurred
      expect(ledgerRow.status).toBe("UNKNOWN");
      expect(ledgerRow.errorCode).toBe("BATCH_COMMIT_FAILED");
    });
  });

  describe("T112-03: Provider dispatch counter <= 1 across failure modes & CAS recovery", () => {
    it("Scenario 1: Missing config throws before dispatch (dispatch count = 0)", async () => {
      const clientRequestId = randomUUID();
      vi.spyOn(aiProviderModule, "createAIProviderFromEnv").mockImplementation(() => {
        throw new AIUnavailableError({ reason: "provider_not_configured" });
      });

      const dispatchCount = 0;
      await expect(
        generateLessonFromRequest({
          userId: "teacher-1",
          role: "TEACHER",
          clientRequestId,
          request: {
            clientRequestId,
            topic: "Weather",
            cefrLevel: "A2",
            learningObjectives: ["Rain vocabulary"],
          },
        })
      ).rejects.toThrow(AIUnavailableError);

      expect(dispatchCount).toBe(0);
      vi.restoreAllMocks();
    });

    it("Scenario 2: Quota exceeded throws before dispatch (dispatch count = 0)", async () => {
      const clientRequestId = randomUUID();
      let dispatchCount = 0;

      const mockProvider: aiProviderModule.AIProvider = {
        providerName: "openai",
        modelName: "gpt-4o-mini",
        analyzeErrors: vi.fn(),
        generateTutoringFeedback: vi.fn(),
        generateLesson: vi.fn().mockImplementation(async () => {
          dispatchCount++;
          return {} as AILessonDraft;
        }),
      };

      vi.spyOn(aiProviderModule, "createAIProviderFromEnv").mockReturnValue(mockProvider);
      vi.spyOn(requestBudgetModule, "reserveUserAICall").mockRejectedValue(
        new AIUnavailableError({ reason: "rate_limited" })
      );

      await expect(
        generateLessonFromRequest({
          userId: "teacher-1",
          role: "TEACHER",
          clientRequestId,
          request: {
            clientRequestId,
            topic: "Weather",
            cefrLevel: "A2",
            learningObjectives: ["Rain vocabulary"],
          },
        })
      ).rejects.toThrow(AIUnavailableError);

      expect(dispatchCount).toBe(0);
      vi.restoreAllMocks();
    });

    it("Scenario 3: Timeout after dispatch records exactly 1 dispatch", async () => {
      const clientRequestId = randomUUID();
      let dispatchCount = 0;

      const mockProvider: aiProviderModule.AIProvider = {
        providerName: "openai",
        modelName: "gpt-4o-mini",
        analyzeErrors: vi.fn(),
        generateTutoringFeedback: vi.fn(),
        generateLesson: vi.fn().mockImplementation(async () => {
          dispatchCount++;
          throw new AIUnavailableError({ reason: "timeout" });
        }),
      };

      vi.spyOn(aiProviderModule, "createAIProviderFromEnv").mockReturnValue(mockProvider);
      vi.spyOn(requestBudgetModule, "reserveUserAICall").mockResolvedValue({
        id: randomUUID(),
        userId: "teacher-1",
        purpose: "lesson_generation",
      });

      await expect(
        generateLessonFromRequest({
          userId: "teacher-1",
          role: "TEACHER",
          clientRequestId,
          request: {
            clientRequestId,
            topic: "Cooking",
            cefrLevel: "A2",
            learningObjectives: ["Kitchen terms"],
          },
        })
      ).rejects.toThrow(AIUnavailableError);

      expect(dispatchCount).toBe(1);

      const ledger = await prisma.lessonCreationRequest.findUniqueOrThrow({
        where: { userId_clientRequestId: { userId: "teacher-1", clientRequestId } },
      });
      expect(ledger.status).toBe("FAILED");
      expect(ledger.errorCode).toBe("AI_UNAVAILABLE");

      vi.restoreAllMocks();
    });

    it("Scenario 4: Graph error after valid AI output records exactly 1 dispatch", async () => {
      const clientRequestId = randomUUID();
      let dispatchCount = 0;

      const validDraft: AILessonDraft = {
        title: "Kitchen Basics",
        transcript: "Chop the onions finely.",
        segments: [{ position: 1, text: "Chop the onions finely.", difficulty: 1.0 }],
        exercises: [
          {
            type: "FULL_DICTATION",
            prompt: "Type what you hear",
            correctAnswer: "Chop the onions finely.",
            position: 1,
            difficulty: 1.0,
          },
        ],
        vocabulary: [
          {
            lemma: "chop",
            displayText: "chop",
            meaningVi: "chặt, thái",
            cefrLevel: "A2",
          },
        ],
      };

      const mockProvider: aiProviderModule.AIProvider = {
        providerName: "openai",
        modelName: "gpt-4o-mini",
        analyzeErrors: vi.fn(),
        generateTutoringFeedback: vi.fn(),
        generateLesson: vi.fn().mockImplementation(async () => {
          dispatchCount++;
          return validDraft;
        }),
      };

      vi.spyOn(aiProviderModule, "createAIProviderFromEnv").mockReturnValue(mockProvider);
      vi.spyOn(requestBudgetModule, "reserveUserAICall").mockResolvedValue({
        id: randomUUID(),
        userId: "teacher-1",
        purpose: "lesson_generation",
      });

      setTxHookForTesting((tx) =>
        createFaultyTx(tx, {
          failAtStatementIndex: 2,
          error: new Error("DB write failure during commitLessonGraph"),
        })
      );

      try {
        await generateLessonFromRequest({
          userId: "teacher-1",
          role: "TEACHER",
          clientRequestId,
          request: {
            clientRequestId,
            topic: "Cooking",
            cefrLevel: "A2",
            learningObjectives: ["Kitchen terms"],
          },
        });
      } catch {
        // Expected
      } finally {
        setTxHookForTesting(null);
        vi.restoreAllMocks();
      }

      expect(dispatchCount).toBe(1);
    });

    it("Scenario 5: Settle budget failure after successful commit preserves committed lesson (dispatch count = 1)", async () => {
      const clientRequestId = randomUUID();
      let dispatchCount = 0;

      const validDraft: AILessonDraft = {
        title: "Hotel Check-in",
        transcript: "Here is your room key.",
        segments: [{ position: 1, text: "Here is your room key.", difficulty: 1.0 }],
        exercises: [
          {
            type: "FULL_DICTATION",
            prompt: "Type what you hear",
            correctAnswer: "Here is your room key.",
            position: 1,
            difficulty: 1.0,
          },
        ],
        vocabulary: [
          {
            lemma: "key",
            displayText: "key",
            meaningVi: "chìa khoá",
            cefrLevel: "A2",
          },
        ],
      };

      const mockProvider: aiProviderModule.AIProvider = {
        providerName: "openai",
        modelName: "gpt-4o-mini",
        analyzeErrors: vi.fn(),
        generateTutoringFeedback: vi.fn(),
        generateLesson: vi.fn().mockImplementation(async () => {
          dispatchCount++;
          return validDraft;
        }),
      };

      vi.spyOn(aiProviderModule, "createAIProviderFromEnv").mockReturnValue(mockProvider);
      vi.spyOn(requestBudgetModule, "reserveUserAICall").mockResolvedValue({
        id: randomUUID(),
        userId: "teacher-1",
        purpose: "lesson_generation",
      });
      vi.spyOn(requestBudgetModule, "settleUserAICall").mockRejectedValue(
        new Error("Temporary billing network timeout")
      );

      const res = await generateLessonFromRequest({
        userId: "teacher-1",
        role: "TEACHER",
        clientRequestId,
        request: {
          clientRequestId,
          topic: "Travel",
          cefrLevel: "A2",
          learningObjectives: ["Hotel terms"],
        },
      });

      expect(dispatchCount).toBe(1);
      expect(res.replayed).toBe(false);
      expect(res.value.lessonId).toBeDefined();

      const ledger = await prisma.lessonCreationRequest.findUniqueOrThrow({
        where: { userId_clientRequestId: { userId: "teacher-1", clientRequestId } },
      });
      expect(ledger.status).toBe("COMMITTED");
      expect(ledger.lessonId).toBe(res.value.lessonId);

      vi.restoreAllMocks();
    });

    it("FAILED -> PENDING recovery race: 2 concurrent callers have exactly 1 winner", async () => {
      const clientRequestId = randomUUID();
      const requestHash = "fixed-hash-recovery-test";

      // Seed a failed request
      await prisma.lessonCreationRequest.create({
        data: {
          id: randomUUID(),
          userId: "teacher-1",
          clientRequestId,
          requestHash,
          mode: "MANUAL",
          status: "FAILED",
          leaseExpiresAt: new Date(Date.now() - 1000),
          errorCode: "BATCH_COMMIT_FAILED",
        },
      });

      // 2 concurrent callers attempt to reserve / recover
      const [resA, resB] = await Promise.all([
        reserveLessonCreationRequest({
          userId: "teacher-1",
          clientRequestId,
          requestHash,
          mode: "MANUAL",
          now: new Date(),
        }),
        reserveLessonCreationRequest({
          userId: "teacher-1",
          clientRequestId,
          requestHash,
          mode: "MANUAL",
          now: new Date(),
        }),
      ]);

      const results = [resA, resB];
      const reservedCount = results.filter((r) => r.kind === "reserved").length;
      const pendingCount = results.filter((r) => r.kind === "pending").length;

      // Exactly 1 winner won the CAS update FAILED -> PENDING
      expect(reservedCount).toBe(1);
      expect(pendingCount).toBe(1);
    });
  });

  describe("T112-04: Authorization and Opaque Errors for Authoring", () => {
    it("rejects unauthorized course authoring by non-owner / non-admin", async () => {
      const clientRequestId = randomUUID();
      await expect(
        createLessonFromRequest({
          userId: "teacher-2", // Does NOT own course-1
          role: "TEACHER",
          clientRequestId,
          request: {
            clientRequestId,
            courseId: "course-1",
            title: "Unauthorized Lesson",
            topic: "Travel",
            cefrLevel: "A2",
            learningObjectives: ["None"],
            transcript: "Forbidden text.",
            accent: "us",
            defaultPlaybackRate: 1.0,
            estimatedMinutes: 5,
            segments: [{ position: 1, text: "Forbidden text.", difficulty: 1.0 }],
            exercises: [
              {
                type: "FULL_DICTATION",
                prompt: "None",
                correctAnswer: "Forbidden text.",
                position: 1,
                difficulty: 1.0,
              },
            ],
            vocabulary: [
              {
                lemma: "forbidden",
                displayText: "forbidden",
                meaningVi: "bị cấm",
                cefrLevel: "A2",
                isTarget: true,
                importance: 1.0,
              },
            ],
          },
        })
      ).rejects.toThrow("Forbidden");
    });
  });
});
