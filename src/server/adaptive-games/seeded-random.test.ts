import { describe, expect, it } from "vitest";
import { createSeededRandom, hashSeed, mulberry32, seededShuffle } from "./seeded-random";

describe("seeded random (Plan13 G1)", () => {
  it("is deterministic for the same seed and different for a different seed", () => {
    const a = createSeededRandom("run-1:0");
    const b = createSeededRandom("run-1:0");
    const c = createSeededRandom("run-1:1");
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    const seqC = Array.from({ length: 5 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("hashes seeds into a 32-bit unsigned integer", () => {
    expect(hashSeed("x")).toBe(hashSeed("x"));
    expect(hashSeed("x")).not.toBe(hashSeed("y"));
    expect(Number.isInteger(hashSeed("abc"))).toBe(true);
    expect(hashSeed("abc")).toBeLessThan(2 ** 32);
  });

  it("shuffles without mutating the input and keeps every element exactly once", () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    const shuffled = seededShuffle(items, mulberry32(42));
    expect(items).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect([...shuffled].sort((left, right) => left - right)).toEqual(items);
    expect(shuffled).not.toEqual(items);
    expect(seededShuffle(items, mulberry32(42))).toEqual(shuffled);
  });
});
