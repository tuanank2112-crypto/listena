import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { cleanVocabularyMeaning } from "@/core/text/vocabulary";
import {
  countLearned,
  rankWeakWords,
  selectRandomReview,
  type MasteryRow,
} from "@/server/learning/weak-words";

/** Plan20 SPEC-P201 §3. Read caps, so one learner's history cannot page the server to death. */
const MASTERY_QUERY_LIMIT = 500;
const WEAK_WORD_LIMIT = 20;
const RANDOM_REVIEW_COUNT = 8;

/**
 * Plan20 SPEC-P201 — the words a learner keeps missing, plus a random re-check
 * pool, both owner-scoped and both chosen on the server.
 *
 * This route is read-only on purpose. It reports what grading already recorded
 * in `VocabularyMastery`; it never writes mastery, never schedules a review and
 * never returns a word belonging to another learner.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();

    const records = await prisma.vocabularyMastery.findMany({
      where: { userId },
      select: {
        vocabularyItemId: true,
        correctCount: true,
        incorrectCount: true,
        masteryScore: true,
        nextReviewAt: true,
        vocabularyItem: { select: { displayText: true, meaningVi: true, ipa: true } },
      },
      orderBy: { lastReviewedAt: "desc" },
      take: MASTERY_QUERY_LIMIT,
    });

    const rows: MasteryRow[] = records.map((record) => ({
      vocabularyItemId: record.vocabularyItemId,
      displayText: record.vocabularyItem.displayText,
      meaningVi: cleanVocabularyMeaning(record.vocabularyItem.meaningVi),
      ipa: record.vocabularyItem.ipa,
      correctCount: record.correctCount,
      incorrectCount: record.incorrectCount,
      masteryScore: record.masteryScore,
      nextReviewAt: record.nextReviewAt,
    }));

    return NextResponse.json({
      weakWords: rankWeakWords(rows, now, WEAK_WORD_LIMIT),
      randomReview: selectRandomReview(rows, now, RANDOM_REVIEW_COUNT, Math.random),
      seenCount: rows.length,
      learnedCount: countLearned(rows),
      weakCount: rows.filter((row) => row.incorrectCount > 0).length,
    });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
    logger.error({ error: message }, "Failed to fetch vocabulary review");
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}
