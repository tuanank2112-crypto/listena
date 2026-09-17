import { createHash } from "node:crypto";

/**
 * Deterministic PRNG for adaptive games (Plan13 G1). The candidate pool and
 * every round's distractors derive from a seed built from the run id (and the
 * round index), so a run is reproducible for audits while consecutive rounds
 * and consecutive runs no longer share the same alphabetical distractor set.
 */
export function hashSeed(seed: string): number {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0);
}

/** mulberry32: small and fast, adequate for shuffling; not for security. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

export function seededShuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
