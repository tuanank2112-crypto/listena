import { auth } from "@/server/auth/config";
import { listOwnedPersonalizedLessons } from "@/server/personalized-learning/service";
import { PersonalizedLessonsClient } from "./personalized-lessons-client";

export default async function PersonalizedLessonsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const lessons = await listOwnedPersonalizedLessons(session.user.id);
  return <PersonalizedLessonsClient initialLessons={lessons} />;
}
