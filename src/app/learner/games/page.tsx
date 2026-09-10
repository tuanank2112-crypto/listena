import { GamesClient } from "./games-client";

export default function GamesPage() {
  // Vocabulary, distractors and validators are deliberately no longer loaded
  // into this server-rendered page. The authenticated game-run endpoint issues
  // only the current learner's public prompts.
  return <GamesClient />;
}
