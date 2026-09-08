import { prisma } from "@/lib/prisma";
import { GamesClient } from "./games-client";

export default async function GamesPage() {
  const lessons = await prisma.lesson.findMany({
    where: {
      status: "PUBLISHED",
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      vocabulary: {
        select: {
          vocabularyItem: {
            select: {
              id: true,
              displayText: true,
              meaningVi: true,
              ipa: true,
              exampleSentence: true,
            },
          },
        },
      },
    },
  });

  return (
    <GamesClient
      units={lessons.map((lesson, index) => ({
        id: lesson.id,
        name: `Unit ${index + 1}`,
        title: lesson.title.replace(/^Bài \d+ - /, ""),
        words: lesson.vocabulary.map(({ vocabularyItem }) => vocabularyItem),
      }))}
    />
  );
}
