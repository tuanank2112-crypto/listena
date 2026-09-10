import { createHash } from "node:crypto";
import {
  type D1BatchStatement,
  d1Boolean,
  d1Timestamp,
  executeNativeD1Batch,
} from "@/lib/d1-batch";
import { getNativeD1Database, prisma } from "@/lib/prisma";
import {
  type CreateAdaptiveGameRunInput,
  type PublicAdaptiveGameAnswerResult,
  type PublicAdaptiveGameRound,
  type PublicAdaptiveGameRun,
  type SubmitAdaptiveGameAnswerInput,
  gradeAdaptiveGameAnswer,
  parseAdaptiveGameAnswerValidator,
  parsePublicAdaptiveGameRound,
} from "./contracts";
import {
  AdaptiveGameConflictError,
  AdaptiveGamePrivateNotFoundError,
  AdaptiveGameRateLimitError,
} from "./errors";
import {
  gameReviewRating,
  nextSkillMastery,
  nextVocabularyMastery,
  processReview,
} from "./mastery";
import {
  ADAPTIVE_GAME_MAX_ROUNDS,
  ADAPTIVE_GAME_MIN_ROUNDS,
  adaptiveDifficulty,
  buildAdaptiveGameRounds,
  selectAdaptiveGameCandidates,
  type AdaptiveGameCandidate,
  type SerializedAdaptiveGameRound,
} from "./selector";
import {
  evaluateGameRunRateLimit,
  GAME_RUN_ROLLING_LIMIT,
  GAME_RUN_ROLLING_WINDOW_MS,
} from "./run-budget";

const CANDIDATE_QUERY_LIMIT = 80;
const PRIVATE_CANDIDATE_QUERY_LIMIT = 24;
const RECENT_EVIDENCE_QUERY_LIMIT = 80;
const GAME_RUN_TTL_MS = 20 * 60 * 1000;

type PublicRoundRow = {
  id: string;
  position: number;
  publicJson: string;
};

type AnswerableRoundRow = PublicRoundRow & {
  validatorJson: string;
  answeredAt: Date | null;
  clientAnswerId: string | null;
  correct: boolean | null;
  score: number | null;
  responseTimeMs: number | null;
  feedbackVi: string | null;
  vocabularyItemId: string;
  run: {
    status: "ACTIVE" | "COMPLETED" | "EXPIRED";
    expiresAt: Date;
    targetSkill: string;
    difficulty: number;
  };
};

export async function createAdaptiveGameRun(
  userId: string,
  input: CreateAdaptiveGameRunInput,
): Promise<PublicAdaptiveGameRun> {
  const targetSkill = input.mode === "SPELL" ? "spelling" : "vocabulary";
  const now = new Date();

  // Do this inexpensive, user-scoped check before selecting candidates or
  // serializing rounds. A client cannot supply its own run timestamp or use a
  // different mode to skip it.
  await assertGameRunCreationRateLimit(
    prisma.adaptiveGameRun.findMany(gameRunRateLimitQuery(userId, now)),
    now,
  );

  const snapshot = await loadAdaptiveCandidateSnapshot(userId, targetSkill);
  const selected = selectAdaptiveGameCandidates(snapshot.candidates, now, ADAPTIVE_GAME_MAX_ROUNDS);

  if (selected.length < ADAPTIVE_GAME_MIN_ROUNDS) {
    throw new AdaptiveGameConflictError(
      "Chưa đủ từ phù hợp để tạo game. Hãy hoàn thành một bài học hoặc ôn từ trước.",
    );
  }

  let generatedRounds;
  try {
    generatedRounds = buildAdaptiveGameRounds({
      mode: input.mode,
      selected,
      candidatePool: snapshot.candidates,
      difficulty: snapshot.difficulty,
    });
  } catch {
    // Duplicate/malformed dataset meanings cannot be patched with a made-up
    // option; reject the run instead of exposing a broken validator.
    throw new AdaptiveGameConflictError(
      "Chưa đủ từ khác nhau để tạo game này. Hãy chọn lại sau khi học thêm.",
    );
  }

  if (
    generatedRounds.length < ADAPTIVE_GAME_MIN_ROUNDS
    || generatedRounds.length > ADAPTIVE_GAME_MAX_ROUNDS
  ) {
    throw new AdaptiveGameConflictError("Không thể tạo số lượt game hợp lệ");
  }

  const selectionSnapshotHash = snapshotHash({
    targetSkill,
    difficulty: snapshot.difficulty,
    selected: selected.map((candidate) => ({
      id: candidate.id,
      mastery: candidate.mastery?.masteryScore ?? null,
      dueAt: candidate.mastery?.nextReviewAt?.toISOString() ?? null,
      recentScore: candidate.recentEvidence?.score ?? null,
    })),
  });

  // Prisma's D1 adapter deliberately does not offer an ACID interactive
  // transaction. The Worker path therefore writes the expiry, rate-guarded
  // run, and every private round through one native D1 batch. Local Node
  // keeps the existing Prisma callback transaction for SQLite and tests.
  if (getNativeD1Database()) {
    return createAdaptiveGameRunWithNativeD1({
      userId,
      mode: input.mode,
      targetSkill,
      difficulty: snapshot.difficulty,
      selectionSnapshotHash,
      generatedRounds,
    });
  }

  return await prisma.$transaction(async (tx) => {
    // The preflight above protects ordinary bursts before the expensive
    // selector. Recheck inside the write transaction so simultaneous tabs or
    // Worker instances cannot turn a stale preflight into an extra run.
    const committedAt = new Date();
    await assertGameRunCreationRateLimit(
      tx.adaptiveGameRun.findMany(gameRunRateLimitQuery(userId, committedAt)),
      committedAt,
    );

    const runId = crypto.randomUUID();
    const expiresAt = new Date(committedAt.getTime() + GAME_RUN_TTL_MS);
    const rounds = generatedRounds.map((round) => ({
      id: crypto.randomUUID(),
      runId,
      ...round,
    }));

    // Expiring only old runs is bounded and does not invalidate a learner's
    // in-progress session. A new run is always explicit client action.
    await tx.adaptiveGameRun.updateMany({
      where: { userId, status: "ACTIVE", expiresAt: { lte: committedAt } },
      data: { status: "EXPIRED", completedAt: committedAt },
    });
    await tx.adaptiveGameRun.create({
      data: {
        id: runId,
        userId,
        mode: input.mode,
        status: "ACTIVE",
        targetSkill,
        difficulty: snapshot.difficulty,
        selectionSnapshotHash,
        startedAt: committedAt,
        expiresAt,
      },
    });
    await tx.adaptiveGameRound.createMany({
      data: rounds.map((round) => ({
        id: round.id,
        runId: round.runId,
        position: round.position,
        vocabularyItemId: round.vocabularyItemId,
        publicJson: round.publicJson,
        validatorJson: round.validatorJson,
      })),
    });

    return {
      id: runId,
      mode: input.mode,
      targetSkill,
      difficulty: snapshot.difficulty,
      expiresAt: expiresAt.toISOString(),
      rounds: rounds.map(toPublicRound),
    };
  });
}

export async function submitAdaptiveGameAnswer(
  userId: string,
  runId: string,
  input: SubmitAdaptiveGameAnswerInput,
): Promise<PublicAdaptiveGameAnswerResult> {
  const now = new Date();

  try {
    // Worker D1 has no Prisma interactive-transaction guarantee. Its native
    // path uses a request-unique conditional claim token as the commit fence;
    // every evidence/mastery command is conditioned on that token before the
    // client-visible answer id is finalized. See the helper below.
    if (getNativeD1Database()) {
      return await submitAdaptiveGameAnswerWithNativeD1(userId, runId, input, now);
    }

    return await prisma.$transaction(async (tx) => {
      const round = await tx.adaptiveGameRound.findFirst({
        where: {
          id: input.roundId,
          runId,
          run: { userId },
        },
        select: {
          id: true,
          position: true,
          publicJson: true,
          validatorJson: true,
          answeredAt: true,
          clientAnswerId: true,
          correct: true,
          score: true,
          responseTimeMs: true,
          feedbackVi: true,
          vocabularyItemId: true,
          run: {
            select: {
              status: true,
              expiresAt: true,
              targetSkill: true,
              difficulty: true,
            },
          },
        },
      }) as AnswerableRoundRow | null;

      if (!round) throw new AdaptiveGamePrivateNotFoundError();

      // An exact replay is safe even after the run has completed or expired:
      // return its persisted score and never create a second evidence row.
      if (round.clientAnswerId === input.clientAnswerId && round.answeredAt) {
        return persistedAnswerResult(round, true);
      }
      if (round.clientAnswerId || round.answeredAt) {
        throw new AdaptiveGameConflictError();
      }
      if (round.run.status !== "ACTIVE" || round.run.expiresAt <= now) {
        throw new AdaptiveGameConflictError("Game này đã hết hạn hoặc đã hoàn thành");
      }

      // A run progresses in order. Fetch only two pending rows: enough to
      // verify this is next and to return a public next round, while keeping
      // the D1 query budget bounded.
      const pendingRounds = await tx.adaptiveGameRound.findMany({
        where: { runId, answeredAt: null },
        orderBy: { position: "asc" },
        take: 2,
        select: { id: true, position: true, publicJson: true },
      });
      if (pendingRounds[0]?.id !== round.id) {
        throw new AdaptiveGameConflictError("Hãy hoàn thành lượt hiện tại trước");
      }

      let correct: boolean;
      try {
        correct = gradeAdaptiveGameAnswer(
          parseAdaptiveGameAnswerValidator(round.validatorJson),
          input.answer,
        );
      } catch {
        throw new AdaptiveGameConflictError("Lượt game này không thể được chấm an toàn");
      }
      const score = correct ? 1 : 0;
      const feedbackVi = correct
        ? "Chính xác. Từ này sẽ được lên lịch ôn phù hợp."
        : "Chưa đúng. Từ này sẽ quay lại sớm hơn để bạn luyện lại.";

      // Claim the round conditionally before any mastery/evidence writes. If
      // another request won the race, read its completed result below instead
      // of replaying the learning update.
      const claimed = await tx.adaptiveGameRound.updateMany({
        where: { id: round.id, clientAnswerId: null, answeredAt: null },
        data: {
          clientAnswerId: input.clientAnswerId,
          answeredAt: now,
          correct,
          score,
          responseTimeMs: input.responseTimeMs ?? null,
          feedbackVi,
        },
      });
      if (claimed.count !== 1) {
        const stored = await tx.adaptiveGameRound.findFirst({
          where: { id: round.id, runId, run: { userId } },
          select: {
            id: true,
            position: true,
            publicJson: true,
            validatorJson: true,
            answeredAt: true,
            clientAnswerId: true,
            correct: true,
            score: true,
            responseTimeMs: true,
            feedbackVi: true,
            vocabularyItemId: true,
            run: {
              select: {
                status: true,
                expiresAt: true,
                targetSkill: true,
                difficulty: true,
              },
            },
          },
        }) as AnswerableRoundRow | null;
        if (stored?.clientAnswerId === input.clientAnswerId && stored.answeredAt) {
          return persistedAnswerResult(stored, true);
        }
        throw new AdaptiveGameConflictError();
      }

      const existingVocabularyMastery = await tx.vocabularyMastery.findUnique({
        where: {
          userId_vocabularyItemId: {
            userId,
            vocabularyItemId: round.vocabularyItemId,
          },
        },
      });
      const review = processReview({
        repetitionCount: existingVocabularyMastery?.repetitionCount ?? 0,
        intervalDays: existingVocabularyMastery?.intervalDays ?? 0,
        easeFactor: existingVocabularyMastery?.easeFactor ?? 2.5,
        rating: gameReviewRating(correct, input.responseTimeMs),
      });
      const vocabularyScore = nextVocabularyMastery({
        existingScore: existingVocabularyMastery?.masteryScore,
        correct,
      });
      await tx.vocabularyMastery.upsert({
        where: {
          userId_vocabularyItemId: {
            userId,
            vocabularyItemId: round.vocabularyItemId,
          },
        },
        create: {
          userId,
          vocabularyItemId: round.vocabularyItemId,
          masteryScore: vocabularyScore,
          correctCount: correct ? 1 : 0,
          incorrectCount: correct ? 0 : 1,
          lastReviewedAt: now,
          nextReviewAt: review.nextReviewAt,
          intervalDays: review.intervalDays,
          easeFactor: review.easeFactor,
          repetitionCount: review.repetitionCount,
        },
        update: {
          masteryScore: vocabularyScore,
          correctCount: { increment: correct ? 1 : 0 },
          incorrectCount: { increment: correct ? 0 : 1 },
          lastReviewedAt: now,
          nextReviewAt: review.nextReviewAt,
          intervalDays: review.intervalDays,
          easeFactor: review.easeFactor,
          repetitionCount: review.repetitionCount,
        },
      });

      const existingSkillMastery = await tx.skillMastery.findUnique({
        where: { userId_skillKey: { userId, skillKey: round.run.targetSkill } },
      });
      const skillScore = nextSkillMastery({
        existingScore: existingSkillMastery?.masteryScore,
        score,
      });
      await tx.skillMastery.upsert({
        where: { userId_skillKey: { userId, skillKey: round.run.targetSkill } },
        create: {
          userId,
          skillKey: round.run.targetSkill,
          masteryScore: skillScore,
          evidenceCount: 1,
          lastUpdatedAt: now,
        },
        update: {
          masteryScore: skillScore,
          evidenceCount: { increment: 1 },
          lastUpdatedAt: now,
        },
      });
      await tx.adaptiveEvidence.create({
        data: {
          userId,
          sourceKind: "ADAPTIVE_GAME_ROUND",
          sourceId: round.id,
          skillKey: round.run.targetSkill,
          vocabularyItemId: round.vocabularyItemId,
          score,
          confidence: 1,
          difficulty: round.run.difficulty,
          gradingMethod: "SERVER_VALIDATOR",
          responseTimeMs: input.responseTimeMs ?? null,
          hintCount: 0,
          createdAt: now,
        },
      });

      const nextRound = pendingRounds[1] ? toPublicRound(pendingRounds[1]) : undefined;
      if (!nextRound) {
        await tx.adaptiveGameRun.updateMany({
          where: { id: runId, userId, status: "ACTIVE" },
          data: { status: "COMPLETED", completedAt: now },
        });
      }

      return {
        correct,
        score,
        feedbackVi,
        idempotent: false,
        ...(nextRound ? { nextRound } : {}),
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // This can only happen when a clientAnswerId was concurrently reused on
      // another round. The caller must generate a new ID; no evidence escaped
      // the rolled-back transaction.
      throw new AdaptiveGameConflictError("Mã trả lời đã được dùng cho lượt khác");
    }
    throw error;
  }
}

/**
 * D1's `batch()` is atomic, unlike Prisma's D1 interactive transaction API.
 * The creation fence lives in the first INSERT: all subsequent writes require
 * that exact new run to exist, so a rate-limited request commits no expiry or
 * orphaned-round side effect.
 */
async function createAdaptiveGameRunWithNativeD1(input: {
  userId: string;
  mode: CreateAdaptiveGameRunInput["mode"];
  targetSkill: string;
  difficulty: number;
  selectionSnapshotHash: string;
  generatedRounds: SerializedAdaptiveGameRound[];
}): Promise<PublicAdaptiveGameRun> {
  const committedAt = new Date();
  const runId = crypto.randomUUID();
  const expiresAt = new Date(committedAt.getTime() + GAME_RUN_TTL_MS);
  const rounds = input.generatedRounds.map((round) => ({
    id: crypto.randomUUID(),
    runId,
    ...round,
  }));

  const results = await executeNativeD1Batch([
    nativeGameRunInsert({
      id: runId,
      userId: input.userId,
      mode: input.mode,
      targetSkill: input.targetSkill,
      difficulty: input.difficulty,
      selectionSnapshotHash: input.selectionSnapshotHash,
      committedAt,
      expiresAt,
    }),
    nativeExpiredGameRunsUpdate({
      runId,
      userId: input.userId,
      committedAt,
    }),
    ...rounds.map((round) => nativeGameRoundInsert(round, input.userId)),
  ]);

  if (results[0]?.meta.changes !== 1) {
    await throwNativeGameRunRateLimit(input.userId, committedAt);
  }

  // The parent insert and every child insert are in one D1 transaction. A
  // zero child count would be an invariant failure rather than a partial game
  // response; fail closed instead of exposing a run without answer keys.
  if (results.slice(2).some((result) => result.meta.changes !== 1)) {
    throw new Error("Native D1 game run batch committed without every round");
  }

  return {
    id: runId,
    mode: input.mode,
    targetSkill: input.targetSkill,
    difficulty: input.difficulty,
    expiresAt: expiresAt.toISOString(),
    rounds: rounds.map(toPublicRound),
  };
}

async function throwNativeGameRunRateLimit(userId: string, now: Date): Promise<never> {
  const decision = evaluateGameRunRateLimit({
    now,
    freshRunStartedAt: (await prisma.adaptiveGameRun.findMany(gameRunRateLimitQuery(userId, now)))
      .map((row) => row.startedAt),
  });
  if (!decision.allowed) {
    throw new AdaptiveGameRateLimitError(
      decision.retryAfterSeconds,
      decision.reason === "ROLLING_LIMIT"
        ? "Bạn đã tạo đủ 12 lượt game mới trong 24 giờ. Hãy hoàn thành các lượt hiện có trước khi tạo thêm."
        : "Bạn vừa tạo một lượt game. Hãy đợi một chút trước khi tạo lượt mới.",
    );
  }

  // A competing Worker may insert immediately after our conditional statement
  // but before this diagnostic read. Preserve the closed rate fence even if
  // that narrow race makes the reason impossible to classify precisely.
  throw new AdaptiveGameRateLimitError(1);
}

/**
 * D1 answer persistence uses a temporary per-request claim token. It is the
 * commit fence: all follow-up evidence/mastery statements require the token,
 * and the final statement replaces it with the browser's idempotency key.
 * A replay therefore cannot re-run the writes just because it sees the same
 * final clientAnswerId after another batch has committed.
 */
async function submitAdaptiveGameAnswerWithNativeD1(
  userId: string,
  runId: string,
  input: SubmitAdaptiveGameAnswerInput,
  now: Date,
): Promise<PublicAdaptiveGameAnswerResult> {
  const round = await prisma.adaptiveGameRound.findFirst({
    where: {
      id: input.roundId,
      runId,
      run: { userId },
    },
    select: {
      id: true,
      position: true,
      publicJson: true,
      validatorJson: true,
      answeredAt: true,
      clientAnswerId: true,
      correct: true,
      score: true,
      responseTimeMs: true,
      feedbackVi: true,
      vocabularyItemId: true,
      run: {
        select: {
          status: true,
          expiresAt: true,
          targetSkill: true,
          difficulty: true,
        },
      },
    },
  }) as AnswerableRoundRow | null;

  if (!round) throw new AdaptiveGamePrivateNotFoundError();
  if (round.clientAnswerId === input.clientAnswerId && round.answeredAt) {
    return persistedAnswerResult(round, true);
  }
  if (round.clientAnswerId || round.answeredAt) {
    throw new AdaptiveGameConflictError();
  }
  if (round.run.status !== "ACTIVE" || round.run.expiresAt <= now) {
    throw new AdaptiveGameConflictError("Game này đã hết hạn hoặc đã hoàn thành");
  }

  const pendingRounds = await prisma.adaptiveGameRound.findMany({
    where: { runId, answeredAt: null },
    orderBy: { position: "asc" },
    take: 2,
    select: { id: true, position: true, publicJson: true },
  });
  if (pendingRounds[0]?.id !== round.id) {
    throw new AdaptiveGameConflictError("Hãy hoàn thành lượt hiện tại trước");
  }

  let correct: boolean;
  try {
    correct = gradeAdaptiveGameAnswer(
      parseAdaptiveGameAnswerValidator(round.validatorJson),
      input.answer,
    );
  } catch {
    throw new AdaptiveGameConflictError("Lượt game này không thể được chấm an toàn");
  }

  const score = correct ? 1 : 0;
  const feedbackVi = correct
    ? "Chính xác. Từ này sẽ được lên lịch ôn phù hợp."
    : "Chưa đúng. Từ này sẽ quay lại sớm hơn để bạn luyện lại.";
  const answeredAt = d1Timestamp(now);
  const claimToken = `game-claim:${crypto.randomUUID()}`;
  const fence = nativeRoundCommitFence({
    roundId: round.id,
    runId,
    claimToken,
    answeredAt,
  });
  const reviewRating = gameReviewRating(correct, input.responseTimeMs);

  const results = await executeNativeD1Batch([
    nativeRoundClaim({
      round,
      userId,
      runId,
      clientAnswerId: input.clientAnswerId,
      claimToken,
      answeredAt,
      correct,
      score,
      responseTimeMs: input.responseTimeMs ?? null,
      feedbackVi,
    }),
    nativeVocabularyMasteryUpsert({
      userId,
      vocabularyItemId: round.vocabularyItemId,
      correct,
      reviewRating,
      now,
      fence,
    }),
    nativeSkillMasteryUpsert({
      userId,
      skillKey: round.run.targetSkill,
      score,
      now,
      fence,
    }),
    nativeAdaptiveEvidenceInsert({
      userId,
      round,
      score,
      responseTimeMs: input.responseTimeMs ?? null,
      now,
      fence,
    }),
    nativeGameRunCompletion({
      userId,
      runId,
      now,
      fence,
    }),
    nativeRoundClaimFinalization({
      roundId: round.id,
      runId,
      clientAnswerId: input.clientAnswerId,
      fence,
    }),
  ]);

  if (results[0]?.meta.changes === 1) {
    // All statements other than the optional completion update must have
    // changed one row. D1 rolls the entire batch back for SQL errors; this
    // check catches an unexpected no-op before we ever tell the client the
    // accepted answer is durable.
    if ([1, 2, 3, 5].some((index) => results[index]?.meta.changes !== 1)) {
      throw new Error("Native D1 game answer batch committed incompletely");
    }

    const nextRound = pendingRounds[1] ? toPublicRound(pendingRounds[1]) : undefined;
    return {
      correct,
      score,
      feedbackVi,
      idempotent: false,
      ...(nextRound ? { nextRound } : {}),
    };
  }

  // A parallel Worker either won this round or used this answer id elsewhere.
  // Read the durable row after its atomic batch; exact replay is safe, every
  // other outcome is a conflict and never repeats evidence/mastery writes.
  const stored = await prisma.adaptiveGameRound.findFirst({
    where: { id: round.id, runId, run: { userId } },
    select: {
      id: true,
      position: true,
      publicJson: true,
      validatorJson: true,
      answeredAt: true,
      clientAnswerId: true,
      correct: true,
      score: true,
      responseTimeMs: true,
      feedbackVi: true,
      vocabularyItemId: true,
      run: {
        select: {
          status: true,
          expiresAt: true,
          targetSkill: true,
          difficulty: true,
        },
      },
    },
  }) as AnswerableRoundRow | null;
  if (stored?.clientAnswerId === input.clientAnswerId && stored.answeredAt) {
    return persistedAnswerResult(stored, true);
  }
  throw new AdaptiveGameConflictError();
}

type NativeRoundCommitFence = {
  sql: string;
  values: Array<string | number | null>;
};

function nativeGameRunInsert(input: {
  id: string;
  userId: string;
  mode: CreateAdaptiveGameRunInput["mode"];
  targetSkill: string;
  difficulty: number;
  selectionSnapshotHash: string;
  committedAt: Date;
  expiresAt: Date;
}): D1BatchStatement {
  const committedAt = d1Timestamp(input.committedAt);
  const cooldownStart = d1Timestamp(
    new Date(input.committedAt.getTime() - 10_000),
  );
  const rollingWindowStart = d1Timestamp(
    new Date(input.committedAt.getTime() - GAME_RUN_ROLLING_WINDOW_MS),
  );
  return {
    sql: `INSERT INTO "AdaptiveGameRun"
            ("id", "userId", "mode", "status", "targetSkill", "difficulty", "selectionSnapshotHash", "startedAt", "expiresAt")
          SELECT ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM "AdaptiveGameRun"
            WHERE "userId" = ? AND "startedAt" > ?
          )
          AND (
            SELECT COUNT(*) FROM "AdaptiveGameRun"
            WHERE "userId" = ? AND "startedAt" > ?
          ) < ?`,
    values: [
      input.id,
      input.userId,
      input.mode,
      input.targetSkill,
      input.difficulty,
      input.selectionSnapshotHash,
      committedAt,
      d1Timestamp(input.expiresAt),
      input.userId,
      cooldownStart,
      input.userId,
      rollingWindowStart,
      GAME_RUN_ROLLING_LIMIT,
    ],
  };
}

function nativeExpiredGameRunsUpdate(input: {
  runId: string;
  userId: string;
  committedAt: Date;
}): D1BatchStatement {
  const committedAt = d1Timestamp(input.committedAt);
  return {
    sql: `UPDATE "AdaptiveGameRun"
          SET "status" = 'EXPIRED', "completedAt" = ?
          WHERE "userId" = ? AND "status" = 'ACTIVE' AND "expiresAt" <= ?
            AND "id" <> ?
            AND EXISTS (
              SELECT 1 FROM "AdaptiveGameRun"
              WHERE "id" = ? AND "userId" = ?
            )`,
    values: [
      committedAt,
      input.userId,
      committedAt,
      input.runId,
      input.runId,
      input.userId,
    ],
  };
}

function nativeGameRoundInsert(
  round: SerializedAdaptiveGameRound & { id: string; runId: string },
  userId: string,
): D1BatchStatement {
  return {
    sql: `INSERT INTO "AdaptiveGameRound"
            ("id", "runId", "position", "vocabularyItemId", "publicJson", "validatorJson")
          SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM "AdaptiveGameRun"
            WHERE "id" = ? AND "userId" = ?
          )`,
    values: [
      round.id,
      round.runId,
      round.position,
      round.vocabularyItemId,
      round.publicJson,
      round.validatorJson,
      round.runId,
      userId,
    ],
  };
}

function nativeRoundClaim(input: {
  round: AnswerableRoundRow;
  userId: string;
  runId: string;
  clientAnswerId: string;
  claimToken: string;
  answeredAt: string;
  correct: boolean;
  score: number;
  responseTimeMs: number | null;
  feedbackVi: string;
}): D1BatchStatement {
  const now = input.answeredAt;
  return {
    sql: `UPDATE "AdaptiveGameRound"
          SET "clientAnswerId" = ?, "answeredAt" = ?, "correct" = ?, "score" = ?,
              "responseTimeMs" = ?, "feedbackVi" = ?
          WHERE "id" = ? AND "runId" = ?
            AND "clientAnswerId" IS NULL AND "answeredAt" IS NULL
            AND EXISTS (
              SELECT 1 FROM "AdaptiveGameRun"
              WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
                AND "expiresAt" > ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM "AdaptiveGameRound"
              WHERE "runId" = ? AND "answeredAt" IS NULL AND "position" < ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM "AdaptiveGameRound"
              WHERE "runId" = ? AND "clientAnswerId" = ?
            )`,
    values: [
      input.claimToken,
      now,
      d1Boolean(input.correct),
      input.score,
      input.responseTimeMs,
      input.feedbackVi,
      input.round.id,
      input.runId,
      input.runId,
      input.userId,
      now,
      input.runId,
      input.round.position,
      input.runId,
      input.clientAnswerId,
    ],
  };
}

function nativeRoundCommitFence(input: {
  roundId: string;
  runId: string;
  claimToken: string;
  answeredAt: string;
}): NativeRoundCommitFence {
  return {
    sql: `EXISTS (
      SELECT 1 FROM "AdaptiveGameRound"
      WHERE "id" = ? AND "runId" = ? AND "clientAnswerId" = ? AND "answeredAt" = ?
    )`,
    values: [input.roundId, input.runId, input.claimToken, input.answeredAt],
  };
}

function nativeVocabularyMasteryUpsert(input: {
  userId: string;
  vocabularyItemId: string;
  correct: boolean;
  reviewRating: ReturnType<typeof gameReviewRating>;
  now: Date;
  fence: NativeRoundCommitFence;
}): D1BatchStatement {
  const initialReview = processReview({
    repetitionCount: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    rating: input.reviewRating,
  });
  const now = d1Timestamp(input.now);
  const review = nativeVocabularyReviewUpdate(input.reviewRating, now);
  return {
    sql: `INSERT INTO "VocabularyMastery"
            ("id", "userId", "vocabularyItemId", "masteryScore", "correctCount", "incorrectCount", "lastReviewedAt", "nextReviewAt", "intervalDays", "easeFactor", "repetitionCount")
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE ${input.fence.sql}
          ON CONFLICT("userId", "vocabularyItemId") DO UPDATE SET
            "masteryScore" = MIN(1.0, MAX(0.0, "VocabularyMastery"."masteryScore" + ?)),
            "correctCount" = "VocabularyMastery"."correctCount" + ?,
            "incorrectCount" = "VocabularyMastery"."incorrectCount" + ?,
            ${review.sql}`,
    values: [
      crypto.randomUUID(),
      input.userId,
      input.vocabularyItemId,
      nextVocabularyMastery({ correct: input.correct }),
      input.correct ? 1 : 0,
      input.correct ? 0 : 1,
      now,
      d1Timestamp(initialReview.nextReviewAt),
      initialReview.intervalDays,
      initialReview.easeFactor,
      initialReview.repetitionCount,
      ...input.fence.values,
      input.correct ? 0.12 : -0.08,
      input.correct ? 1 : 0,
      input.correct ? 0 : 1,
      ...review.values,
    ],
  };
}

function nativeSkillMasteryUpsert(input: {
  userId: string;
  skillKey: string;
  score: number;
  now: Date;
  fence: NativeRoundCommitFence;
}): D1BatchStatement {
  const now = d1Timestamp(input.now);
  return {
    sql: `INSERT INTO "SkillMastery"
            ("id", "userId", "skillKey", "masteryScore", "evidenceCount", "lastUpdatedAt")
          SELECT ?, ?, ?, ?, 1, ?
          WHERE ${input.fence.sql}
          ON CONFLICT("userId", "skillKey") DO UPDATE SET
            "masteryScore" = MIN(1.0, MAX(0.0, "SkillMastery"."masteryScore" + (? - "SkillMastery"."masteryScore") * 0.18)),
            "evidenceCount" = "SkillMastery"."evidenceCount" + 1,
            "lastUpdatedAt" = ?`,
    values: [
      crypto.randomUUID(),
      input.userId,
      input.skillKey,
      nextSkillMastery({ score: input.score }),
      now,
      ...input.fence.values,
      input.score,
      now,
    ],
  };
}

function nativeAdaptiveEvidenceInsert(input: {
  userId: string;
  round: AnswerableRoundRow;
  score: number;
  responseTimeMs: number | null;
  now: Date;
  fence: NativeRoundCommitFence;
}): D1BatchStatement {
  return {
    sql: `INSERT INTO "AdaptiveEvidence"
            ("id", "userId", "sourceKind", "sourceId", "skillKey", "vocabularyItemId", "score", "confidence", "difficulty", "gradingMethod", "responseTimeMs", "hintCount", "createdAt")
          SELECT ?, ?, 'ADAPTIVE_GAME_ROUND', ?, ?, ?, ?, 1.0, ?, 'SERVER_VALIDATOR', ?, 0, ?
          WHERE ${input.fence.sql}`,
    values: [
      crypto.randomUUID(),
      input.userId,
      input.round.id,
      input.round.run.targetSkill,
      input.round.vocabularyItemId,
      input.score,
      input.round.run.difficulty,
      input.responseTimeMs,
      d1Timestamp(input.now),
      ...input.fence.values,
    ],
  };
}

function nativeGameRunCompletion(input: {
  userId: string;
  runId: string;
  now: Date;
  fence: NativeRoundCommitFence;
}): D1BatchStatement {
  return {
    sql: `UPDATE "AdaptiveGameRun"
          SET "status" = 'COMPLETED', "completedAt" = ?
          WHERE "id" = ? AND "userId" = ? AND "status" = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM "AdaptiveGameRound"
              WHERE "runId" = ? AND "answeredAt" IS NULL
            )
            AND ${input.fence.sql}`,
    values: [
      d1Timestamp(input.now),
      input.runId,
      input.userId,
      input.runId,
      ...input.fence.values,
    ],
  };
}

function nativeRoundClaimFinalization(input: {
  roundId: string;
  runId: string;
  clientAnswerId: string;
  fence: NativeRoundCommitFence;
}): D1BatchStatement {
  return {
    sql: `UPDATE "AdaptiveGameRound"
          SET "clientAnswerId" = ?
          WHERE "id" = ? AND "runId" = ? AND ${input.fence.sql}`,
    values: [
      input.clientAnswerId,
      input.roundId,
      input.runId,
      ...input.fence.values,
    ],
  };
}

function nativeVocabularyReviewUpdate(
  rating: ReturnType<typeof gameReviewRating>,
  now: string,
): { sql: string; values: Array<string | number | null> } {
  const table = `"VocabularyMastery"`;
  const interval = `${table}."intervalDays"`;
  const repetitions = `${table}."repetitionCount"`;
  const ease = `${table}."easeFactor"`;
  const nextReviewAt = (modifier: string) => (
    `strftime('%Y-%m-%dT%H:%M:%f+00:00', ?, ${modifier})`
  );
  const ceil = (expression: string) => (
    `(CAST((${expression}) AS INTEGER) + CASE
      WHEN (${expression}) > CAST((${expression}) AS INTEGER) THEN 1 ELSE 0 END)`
  );

  if (rating === "AGAIN") {
    return {
      sql: `"lastReviewedAt" = ?,
            "nextReviewAt" = ${nextReviewAt("'+10 minutes'")},
            "intervalDays" = ${10 / (24 * 60)},
            "easeFactor" = ROUND(MAX(1.3, ${ease} - 0.2), 2),
            "repetitionCount" = 0`,
      values: [now, now],
    };
  }

  if (rating === "HARD") {
    const reviewedInterval = `MAX(${interval}, ${1 / 24})`;
    const roundedInterval = ceil(reviewedInterval);
    return {
      sql: `"lastReviewedAt" = ?,
            "nextReviewAt" = CASE WHEN ${repetitions} = 0
              THEN ${nextReviewAt("'+1 hour'")}
              ELSE ${nextReviewAt("'+' || " + roundedInterval + " || ' days'")}
            END,
            "intervalDays" = CASE WHEN ${repetitions} = 0 THEN ${1 / 24} ELSE ${roundedInterval} END,
            "easeFactor" = ROUND(MAX(1.3, ${ease} - 0.15), 2),
            "repetitionCount" = ${repetitions} + 1`,
      values: [now, now, now],
    };
  }

  const nextEase = rating === "EASY"
    ? `ROUND(MAX(1.3, ${ease} + 0.15), 2)`
    : `ROUND(MAX(1.3, ${ease}), 2)`;
  const firstInterval = rating === "EASY" ? 3 : 1;
  const rawInterval = rating === "EASY"
    ? `ROUND(${interval} * (${nextEase}) * 1.5 * 10) / 10.0`
    : `ROUND(${interval} * (${nextEase}) * 10) / 10.0`;
  const roundedInterval = ceil(rawInterval);
  const intervalExpression = `CASE WHEN ${repetitions} = 0 THEN ${firstInterval} ELSE ${roundedInterval} END`;
  return {
    sql: `"lastReviewedAt" = ?,
          "nextReviewAt" = ${nextReviewAt("'+' || " + intervalExpression + " || ' days'")},
          "intervalDays" = ${intervalExpression},
          "easeFactor" = ${nextEase},
          "repetitionCount" = ${repetitions} + 1`,
    values: [now, now],
  };
}

function gameRunRateLimitQuery(userId: string, now: Date) {
  return {
    where: {
      userId,
      startedAt: { gt: new Date(now.getTime() - GAME_RUN_ROLLING_WINDOW_MS) },
    },
    orderBy: { startedAt: "desc" as const },
    // Twelve rows determine both the daily cap and the most recent creation.
    // Never count an unbounded history merely to render one game form.
    take: GAME_RUN_ROLLING_LIMIT,
    select: { startedAt: true },
  };
}

async function assertGameRunCreationRateLimit(
  recentRunRows: Promise<Array<{ startedAt: Date }>>,
  now: Date,
) {
  const decision = evaluateGameRunRateLimit({
    now,
    freshRunStartedAt: (await recentRunRows).map((row) => row.startedAt),
  });
  if (decision.allowed) return;

  throw new AdaptiveGameRateLimitError(
    decision.retryAfterSeconds,
    decision.reason === "ROLLING_LIMIT"
      ? "Bạn đã tạo đủ 12 lượt game mới trong 24 giờ. Hãy hoàn thành các lượt hiện có trước khi tạo thêm."
      : "Bạn vừa tạo một lượt game. Hãy đợi một chút trước khi tạo lượt mới.",
  );
}

function persistedAnswerResult(
  round: AnswerableRoundRow,
  idempotent: boolean,
): PublicAdaptiveGameAnswerResult {
  return {
    correct: round.correct ?? false,
    score: round.score ?? 0,
    feedbackVi: round.feedbackVi ?? "Kết quả đã được lưu.",
    idempotent,
  };
}

function toPublicRound(round: PublicRoundRow): PublicAdaptiveGameRound {
  return {
    id: round.id,
    position: round.position,
    content: parsePublicAdaptiveGameRound(round.publicJson),
  };
}

async function loadAdaptiveCandidateSnapshot(
  userId: string,
  targetSkill: "vocabulary" | "spelling",
) {
  const [profile, skillMasteries, curriculumVocabulary, privateVocabulary] = await Promise.all([
    prisma.learnerProfile.findUnique({
      where: { userId },
      select: { estimatedCefrLevel: true, vocabularyMastery: true, spellingMastery: true },
    }),
    prisma.skillMastery.findMany({
      where: { userId, skillKey: { in: ["vocabulary", "spelling"] } },
      select: { skillKey: true, masteryScore: true },
    }),
    prisma.vocabularyItem.findMany({
      where: {
        lessons: { some: { lesson: { status: "PUBLISHED" } } },
      },
      orderBy: { lemma: "asc" },
      take: CANDIDATE_QUERY_LIMIT - PRIVATE_CANDIDATE_QUERY_LIMIT,
      select: {
        id: true,
        displayText: true,
        meaningVi: true,
        ipa: true,
        exampleSentence: true,
        audioUrl: true,
        cefrLevel: true,
        lemma: true,
      },
    }),
    // Keep a bounded reserved slot for private vocabulary. A broad OR ordered
    // by lemma would let a large global curriculum crowd out the learner's
    // READY artifact vocabulary before it ever reaches the adaptive selector.
    prisma.vocabularyItem.findMany({
      where: {
        personalizedLessons: {
          some: { personalizedLesson: { userId, status: "READY" } },
        },
      },
      orderBy: { lemma: "asc" },
      take: PRIVATE_CANDIDATE_QUERY_LIMIT,
      select: {
        id: true,
        displayText: true,
        meaningVi: true,
        ipa: true,
        exampleSentence: true,
        audioUrl: true,
        cefrLevel: true,
        lemma: true,
      },
    }),
  ]);

  const vocabulary = [...new Map(
    [...privateVocabulary, ...curriculumVocabulary]
      .map((item) => [item.id, item] as const),
  ).values()]
    .sort((left, right) => left.lemma.localeCompare(right.lemma))
    .slice(0, CANDIDATE_QUERY_LIMIT);

  if (vocabulary.length < ADAPTIVE_GAME_MIN_ROUNDS) {
    return { candidates: [] as AdaptiveGameCandidate[], difficulty: 0.2 };
  }

  const vocabularyItemIds = vocabulary.map((item) => item.id);
  const [masteries, evidence] = await Promise.all([
    prisma.vocabularyMastery.findMany({
      where: { userId, vocabularyItemId: { in: vocabularyItemIds } },
      select: { vocabularyItemId: true, masteryScore: true, nextReviewAt: true },
    }),
    prisma.adaptiveEvidence.findMany({
      where: { userId, vocabularyItemId: { in: vocabularyItemIds } },
      orderBy: { createdAt: "desc" },
      take: RECENT_EVIDENCE_QUERY_LIMIT,
      select: { vocabularyItemId: true, score: true, createdAt: true },
    }),
  ]);
  const masteryByVocabularyId = new Map(masteries.map((mastery) => [mastery.vocabularyItemId, mastery]));
  const recentEvidenceByVocabularyId = new Map<string, { score: number; createdAt: Date }>();
  for (const item of evidence) {
    if (item.vocabularyItemId && !recentEvidenceByVocabularyId.has(item.vocabularyItemId)) {
      recentEvidenceByVocabularyId.set(item.vocabularyItemId, {
        score: item.score,
        createdAt: item.createdAt,
      });
    }
  }

  const skillPrior = targetSkill === "spelling"
    ? profile?.spellingMastery ?? 0.5
    : profile?.vocabularyMastery ?? 0.5;
  const skillMastery = skillMasteries.find((item) => item.skillKey === targetSkill)?.masteryScore ?? skillPrior;
  const learnerCefr = profile?.estimatedCefrLevel ?? "A2";

  return {
    candidates: vocabulary.map((item) => ({
      ...item,
      levelDistance: cefrDistance(item.cefrLevel, learnerCefr),
      mastery: masteryByVocabularyId.get(item.id),
      recentEvidence: recentEvidenceByVocabularyId.get(item.id),
    })),
    difficulty: adaptiveDifficulty(skillMastery),
  };
}

function snapshotHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2002";
}

function cefrDistance(left: string, right: string) {
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const leftIndex = levels.indexOf(left);
  const rightIndex = levels.indexOf(right);
  if (leftIndex < 0 || rightIndex < 0) return 0;
  return Math.abs(leftIndex - rightIndex);
}
