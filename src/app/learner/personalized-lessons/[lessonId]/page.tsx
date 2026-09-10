import { notFound } from "next/navigation";
import { auth } from "@/server/auth/config";
import {
  getOwnedPersonalizedLesson,
  PersonalizedLearningError,
} from "@/server/personalized-learning/service";
import { PersonalizedLessonPlayer } from "./personalized-lesson-player";

export default async function PersonalizedLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const { lessonId } = await params;
  const lesson = await loadOwnedLesson(session.user.id, lessonId);
  return <PersonalizedLessonPlayer lesson={lesson} />;
}

async function loadOwnedLesson(userId: string, lessonId: string) {
  try {
    return await getOwnedPersonalizedLesson(userId, lessonId);
  } catch (error) {
    if (error instanceof PersonalizedLearningError && error.code === "PRIVATE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
