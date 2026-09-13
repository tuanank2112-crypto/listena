import type { LearningSessionMode, PublicLearningSession } from "./types";
import { shouldRetrySessionStart, startRetryDelayMs } from "./start-contract";

export type StartSessionRequest = {
  clientStartId: string;
  lessonId?: string;
  mode: LearningSessionMode;
  goal?: string;
  scenarioKey?: string;
};

type StartPayload = {
  session?: PublicLearningSession;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
};

export class SessionStartRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "SessionStartRequestError";
  }
}

type StartRequestOptions = {
  attempt?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
};

/**
 * Sends all automatic retries with the original start UUID. This leaves
 * session creation idempotent even when the browser loses a server response.
 */
export async function requestSessionStart(
  input: StartSessionRequest,
  options: StartRequestOptions = {},
): Promise<PublicLearningSession> {
  const attempt = options.attempt ?? 0;
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? waitForStartRetry;
  let response: Response;
  try {
    response = await fetcher("/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (shouldRetrySessionStart({ attempt, transportFailure: true })) {
      await wait(startRetryDelayMs(), options.signal);
      return requestSessionStart(input, { ...options, attempt: attempt + 1, fetcher, wait });
    }
    throw error;
  }

  const payload = await response.json().catch(() => ({})) as StartPayload;
  if (response.ok && payload.session?.id) return payload.session;

  const retryAfterSeconds = payload.retryAfterSeconds ?? Number(response.headers.get("Retry-After"));
  if (shouldRetrySessionStart({ attempt, code: payload.code, status: response.status })) {
    await wait(startRetryDelayMs(retryAfterSeconds), options.signal);
    return requestSessionStart(input, { ...options, attempt: attempt + 1, fetcher, wait });
  }
  throw new SessionStartRequestError(payload.error || "Chưa thể mở phiên AI.", payload.code);
}

function waitForStartRetry(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("Session start aborted", "AbortError"));
    }, { once: true });
  });
}
