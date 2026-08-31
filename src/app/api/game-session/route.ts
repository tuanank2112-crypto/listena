import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { GameSessionSchema } from "@/server/validation/game-session";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = GameSessionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid game session", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { mode, results } = parsed.data;
    const vocabularyItemIds = [...new Set(results.map((result) => result.vocabularyItemId))];

    const result = await prisma.$transaction(async (tx) => {
      const vocabularies = await tx.vocabularyItem.findMany({
        where: { id: { in: vocabularyItemIds } },
        select: { id: true },
      });
      const validIds = new Set(vocabularies.map((item) => item.id));
      const now = new Date();
      let correctCount = 0;

      for (const item of results) {
        if (!validIds.has(item.vocabularyItemId)) continue;
        if (item.correct) correctCount += 1;

        const existing = await tx.vocabularyMastery.findUnique({
          where: {
            userId_vocabularyItemId: {
              userId: session.user.id,
              vocabularyItemId: item.vocabularyItemId,
            },
          },
        });

        const delta = item.correct ? 0.12 : -0.08;
        const masteryScore = Math.min(1, Math.max(0, (existing?.masteryScore ?? 0.3) + delta));

        if (existing) {
          await tx.vocabularyMastery.update({
            where: { id: existing.id },
            data: {
              masteryScore,
              correctCount: { increment: item.correct ? 1 : 0 },
              incorrectCount: { increment: item.correct ? 0 : 1 },
              lastReviewedAt: now,
              nextReviewAt: now,
            },
          });
        } else {
          await tx.vocabularyMastery.create({
            data: {
              userId: session.user.id,
              vocabularyItemId: item.vocabularyItemId,
              masteryScore: item.correct ? 0.42 : 0.22,
              correctCount: item.correct ? 1 : 0,
              incorrectCount: item.correct ? 0 : 1,
              lastReviewedAt: now,
              nextReviewAt: now,
            },
          });
        }
      }

      return { mode, accepted: results.length, correctCount, updatedAt: now.toISOString() };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logger.error({ error }, "Game session submission failed");
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}
