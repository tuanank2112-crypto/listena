/**
 * Game engine types for the ListenAI game hub.
 */
export interface GameWord {
  id: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  exampleSentence: string | null;
}
export type GameMode = "quiz" | "match" | "spell" | "scramble" | "cloze" | "sprint";
export interface GameResultItem {
  vocabularyItemId: string;
  correct: boolean;
  responseTimeMs?: number;
}
export interface GameAnswerEvent {
  word: GameWord;
  correct: boolean;
  responseTimeMs: number;
  mode: GameMode;
}
