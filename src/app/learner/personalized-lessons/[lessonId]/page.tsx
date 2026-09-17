import { notFound } from "next/navigation";
import { auth } from "@/server/auth/config";
import {
  getOwnedPersonalizedLessonStatus,
  PersonalizedLearningError,
} from "@/server/personalized-learning/service";
import { PersonalizedLessonPlayer } from "./personalized-lesson-player";
import { PersonalizedLessonProgress } from "./personalized-lesson-progress";

export default async function PersonalizedLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const { lessonId } = await params;
  const lesson = await loadOwnedLessonStatus(session.user.id, lessonId);
  if (lesson.status === "READY") return <PersonalizedLessonPlayer lesson={lesson} />;
  // GENERATING/FAILED: the client polls the status endpoint (Plan13 async flow).
  return <PersonalizedLessonProgress initial={lesson} />;
}

async function loadOwnedLessonStatus(userId: string, lessonId: string) {
  try {
    return await getOwnedPersonalizedLessonStatus(userId, lessonId);
  } catch (error) {
    if (error instanceof PersonalizedLearningError && error.code === "PRIVATE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
