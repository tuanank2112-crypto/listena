/**
 * Client intent lifecycle manager for durable, replay-safe mutation intents.
 * Adheres to Plan 11 SPEC-P111-INTEGRITY.
 */

export interface ClientPendingIntent<T> {
  key: string;
  payload: T;
  createdAt: number;
}

const MAX_INTENT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export type IntentKind = "attempt" | "flashcard" | "lesson-manual" | "lesson-ai";
export type IntentStorageKey = `listenai:${string}:${IntentKind}:${string}`;

export function buildIntentKey(
  ownerId: string,
  kind: IntentKind,
  resourceId: string
): IntentStorageKey {
  return `listenai:${ownerId}:${kind}:${resourceId}`;
}

export function getStoredIntent<T>(storageKey: IntentStorageKey | string): ClientPendingIntent<T> | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientPendingIntent<T>;
    if (!parsed || typeof parsed !== "object" || !parsed.key || !parsed.payload) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    if (Date.now() - parsed.createdAt > MAX_INTENT_AGE_MS) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredIntent<T>(storageKey: IntentStorageKey | string, intent: ClientPendingIntent<T>): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(intent));
  } catch {
    // Quota exceeded or storage disabled
  }
}

export function clearStoredIntent(storageKey: IntentStorageKey | string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore
  }
}

export function clearOwnerIntents(ownerId: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const prefix = `listenai:${ownerId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}
