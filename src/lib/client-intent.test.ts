import { beforeEach, describe, expect, it } from "vitest";
import {
  buildIntentKey,
  clearOwnerIntents,
  clearStoredIntent,
  getStoredIntent,
  setStoredIntent,
} from "./client-intent";

describe("client intent lifecycle storage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, val: string) => store.set(key, val),
          removeItem: (key: string) => store.delete(key),
          get length() {
            return store.size;
          },
          key: (index: number) => Array.from(store.keys())[index] ?? null,
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it("stores and retrieves a pending intent with exact payload", () => {
    const key = buildIntentKey("learner-1", "flashcard", "fc-123");
    const intent = {
      key: "uuid-123",
      payload: { responseTimeMs: 1542, rating: "GOOD" },
      createdAt: Date.now(),
    };

    setStoredIntent(key, intent);
    const retrieved = getStoredIntent<typeof intent.payload>(key);

    expect(retrieved).toEqual(intent);
  });

  it("returns null and cleans up expired intents (>24h)", () => {
    const key = buildIntentKey("learner-1", "attempt", "ex-123");
    const intent = {
      key: "uuid-old",
      payload: { value: 42 },
      createdAt: Date.now() - 25 * 60 * 60 * 1000,
    };

    store.set(key, JSON.stringify(intent));
    const retrieved = getStoredIntent(key);

    expect(retrieved).toBeNull();
    expect(store.has(key)).toBe(false);
  });

  it("handles malformed JSON gracefully", () => {
    const key = buildIntentKey("learner-1", "lesson-ai", "sig-1");
    store.set(key, "{not-json");

    expect(getStoredIntent(key)).toBeNull();
  });

  it("clears intent properly", () => {
    const key = buildIntentKey("learner-1", "attempt", "ex-1");
    setStoredIntent(key, { key: "k", payload: {}, createdAt: Date.now() });
    expect(store.has(key)).toBe(true);

    clearStoredIntent(key);
    expect(store.has(key)).toBe(false);
  });

  it("clears only owner-scoped intents on signout without affecting other users", () => {
    const userAKey1 = buildIntentKey("user-A", "attempt", "ex-1");
    const userAKey2 = buildIntentKey("user-A", "flashcard", "fc-1");
    const userBKey = buildIntentKey("user-B", "attempt", "ex-1");

    setStoredIntent(userAKey1, { key: "k-a1", payload: { a: 1 }, createdAt: Date.now() });
    setStoredIntent(userAKey2, { key: "k-a2", payload: { a: 2 }, createdAt: Date.now() });
    setStoredIntent(userBKey, { key: "k-b", payload: { b: 1 }, createdAt: Date.now() });

    expect(store.size).toBe(3);

    clearOwnerIntents("user-A");

    expect(getStoredIntent(userAKey1)).toBeNull();
    expect(getStoredIntent(userAKey2)).toBeNull();
    expect(getStoredIntent(userBKey)).not.toBeNull();
    expect(store.has(userBKey)).toBe(true);
  });
});
