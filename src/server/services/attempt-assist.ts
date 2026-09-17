import { createHash } from "node:crypto";
import { normalizeText, tokenize } from "@/core/text/normalize";

/**
 * Answer Canvas assist (SPEC-P133).
 *
 * Every helper here is pure and deterministic for a given seed, so the same
 * `(clientAttemptId, mode)` always yields the same skeleton/tiles. That is the
 * whole ASSIST_LIMIT strategy: there is no per-request state to persist on a
 * serverless host (an Attempt row does not exist before submission), so instead
 * a repeated call cannot buy anything new — the payload is identical and the
 * client adds `hintCost` to `hintCount` once per mode. The server keeps trusting
 * the client-reported `hintCount` exactly as the legacy `/api/attempt` contract
 * already does.
 *
 * Invariant: no helper returns the answer words in their original order.
 */

export type AssistMode = "SKELETON" | "TILES";

export const ASSIST_HINT_COST: Record<AssistMode, 1 | 2> = {
  SKELETON: 1,
  TILES: 2,
};

/** Number of decoy words mixed into a TILES payload. */
export const TILE_DECOY_COUNT = 2;

/** Upper bound on tile count so a long open-ish answer cannot flood the UI. */
export const MAX_TILE_ANSWER_WORDS = 24;

export interface SkeletonSlot {
  length: number;
  first?: string;
}

export interface AssistPayload {
  mode: AssistMode;
  hintCost: 1 | 2;
  skeleton?: SkeletonSlot[];
  /** Human readable form of `skeleton` ("t _ _ _   _ _ _ _"), see 01-CONTRACTS. */
  skeletonText?: string;
  tiles?: string[];
}

export function buildAssistSeed(clientAttemptId: string, mode: AssistMode): string {
  return createHash("sha256").update(`${clientAttemptId}${mode}`).digest("hex");
}

/**
 * mulberry32 seeded from the first 32 bits of a sha256 hex digest. Small, fast
 * and deterministic across platforms, which is all the canvas needs.
 */
export function createSeededRandom(seed: string): () => number {
  let state = Number.parseInt(seed.slice(0, 8), 16) >>> 0;
  if (!Number.isFinite(state)) state = 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** Answer words exactly as the grader will compare them (lowercase, no punctuation). */
export function splitAnswerWords(answer: string): string[] {
  return tokenize(normalizeText(answer));
}

export function buildSkeleton(answer: string, seed: string): { slots: SkeletonSlot[]; text: string } {
  const words = splitAnswerWords(answer);
  const revealCount = Math.floor(words.length / 3);
  const random = createSeededRandom(seed);
  const revealed = new Set(
    shuffleWith(words.map((_, index) => index), random).slice(0, revealCount),
  );
  const slots = words.map<SkeletonSlot>((word, index) =>
    revealed.has(index) ? { length: word.length, first: word[0] } : { length: word.length },
  );
  const text = slots
    .map((slot) => {
      const cells = Array.from({ length: slot.length }, () => "_");
      if (slot.first) cells[0] = slot.first;
      return cells.join(" ");
    })
    .join("   ");
  return { slots, text };
}

function answerOrderOf(tiles: readonly string[], answerSet: ReadonlySet<string>): string[] {
  return tiles.filter((tile) => answerSet.has(tile));
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function pickDecoys(
  answerWords: readonly string[],
  lessonWords: readonly string[],
  random: () => number,
  count = TILE_DECOY_COUNT,
): string[] {
  const answerSet = new Set(answerWords);
  const lengths = new Set(answerWords.map((word) => word.length));
  const candidates = [...new Set(lessonWords.flatMap(splitAnswerWords))].filter(
    (word) => word.length >= 2 && !answerSet.has(word),
  );
  const similar = candidates.filter((word) =>
    [...lengths].some((length) => Math.abs(length - word.length) <= 1),
  );
  const pool = similar.length >= count ? similar : candidates;
  return shuffleWith(pool, random).slice(0, count);
}

export function buildTiles(answer: string, lessonWords: readonly string[], seed: string): string[] {
  const answerWords = splitAnswerWords(answer).slice(0, MAX_TILE_ANSWER_WORDS);
  const random = createSeededRandom(seed);
  const decoys = pickDecoys(answerWords, lessonWords, random);
  const answerSet = new Set(answerWords);
  let tiles = shuffleWith([...answerWords, ...decoys], random);
  if (answerWords.length > 1) {
    let guard = 0;
    while (sameSequence(answerOrderOf(tiles, answerSet), answerWords) && guard < 16) {
      tiles = shuffleWith(tiles, random);
      guard += 1;
    }
    if (sameSequence(answerOrderOf(tiles, answerSet), answerWords)) {
      // Deterministic last resort: swapping the first two answer tiles always
      // breaks the original order when the answer has more than one word.
      const first = tiles.findIndex((tile) => answerSet.has(tile));
      const second = tiles.findIndex((tile, index) => index > first && answerSet.has(tile));
      [tiles[first], tiles[second]] = [tiles[second], tiles[first]];
    }
  }
  return tiles;
}

export function isAssistableAnswer(answer: string): boolean {
  return splitAnswerWords(answer).length > 0;
}

export function buildAssistPayload(input: {
  mode: AssistMode;
  answer: string;
  lessonWords: readonly string[];
  clientAttemptId: string;
}): AssistPayload {
  const seed = buildAssistSeed(input.clientAttemptId, input.mode);
  if (input.mode === "SKELETON") {
    const { slots, text } = buildSkeleton(input.answer, seed);
    return { mode: "SKELETON", hintCost: ASSIST_HINT_COST.SKELETON, skeleton: slots, skeletonText: text };
  }
  return {
    mode: "TILES",
    hintCost: ASSIST_HINT_COST.TILES,
    tiles: buildTiles(input.answer, input.lessonWords, seed),
  };
}
