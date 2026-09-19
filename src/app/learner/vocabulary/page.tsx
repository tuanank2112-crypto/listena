import { VocabularyReviewClient } from "./vocabulary-review-client";

/**
 * Plan20 SPEC-P202 — "Từ yếu". The page itself is a shell; the learner's words
 * arrive from `/api/learner/vocabulary-review`, which is where ownership and
 * selection are enforced. Auth is inherited from `learner/layout.tsx`.
 */
export default function VocabularyReviewPage() {
  return <VocabularyReviewClient />;
}
