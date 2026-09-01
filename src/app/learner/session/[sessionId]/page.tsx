import { LearningSessionPlayer } from "./session-player";

export default async function LearningSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <LearningSessionPlayer sessionId={sessionId} />;
}
