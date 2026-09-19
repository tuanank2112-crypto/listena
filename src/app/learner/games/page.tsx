import { GamesClient } from "./games-client";
import { prisma } from "@/lib/prisma";

/**
 * Plan22 SPEC-P223: a lesson journey links here with `?lesson=<id>&mode=match`.
 * The lesson is checked on the server — an unpublished or unknown id is simply
 * dropped, so a hand-typed link can only ever start an ordinary free-play run.
 */
export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string; mode?: string }>;
}) {
  const { lesson, mode } = await searchParams;

  const lessonRow = lesson
    ? await prisma.lesson.findFirst({
        where: { id: lesson, status: "PUBLISHED" },
        select: { id: true, title: true },
      })
    : null;

  const autoMode = mode === "match" || mode === "spell" || mode === "quiz" ? mode : undefined;

  // Vocabulary, distractors and validators are deliberately not loaded into
  // this server-rendered page. The authenticated game-run endpoint issues only
  // the current learner's public prompts.
  return (
    <GamesClient
      lessonId={lessonRow?.id}
      lessonTitle={lessonRow?.title}
      autoMode={lessonRow ? autoMode : undefined}
    />
  );
}
