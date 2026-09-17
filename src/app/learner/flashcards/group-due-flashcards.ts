/**
 * Plan13 L5 (display side): legacy data may hold several active cards for the
 * same word (one per failed attempt before flashcard reuse landed). They all
 * share one VocabularyMastery schedule, so rating each of them in a row would
 * push the interval 1d -> 3d -> 8d within a minute. The page shows one card per
 * vocabularyItemId (the oldest); nothing is deleted from the database.
 */
export function groupDueFlashcardsByVocabulary<T extends { vocabularyItem: { id: string } }>(
  cards: readonly T[],
): T[] {
  const byVocabulary = new Map<string, T>();
  for (const card of cards) {
    if (!byVocabulary.has(card.vocabularyItem.id)) {
      byVocabulary.set(card.vocabularyItem.id, card);
    }
  }
  return [...byVocabulary.values()];
}
