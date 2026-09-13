import { describe, expect, it, vi } from "vitest";
import {
  requestSessionStart,
  SessionStartRequestError,
} from "./start-request";

const input = {
  clientStartId: "00000000-0000-4000-8000-000000000301",
  mode: "MISSION" as const,
  scenarioKey: "cafe-order",
};

function response(status: number, body: unknown, retryAfter?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(retryAfter ? { "Retry-After": retryAfter } : {}) },
  });
}

describe("requestSessionStart", () => {
  it("automatically retries an in-progress start with the exact same UUID", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { error: "Preparing", code: "START_IN_PROGRESS", retryAfterSeconds: 1 }))
      .mockResolvedValueOnce(response(201, { session: { id: "session-1" } }));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(requestSessionStart(input, { fetcher, wait })).resolves.toMatchObject({ id: "session-1" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).clientStartId).toBe(input.clientStartId);
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string).clientStartId).toBe(input.clientStartId);
    expect(wait).toHaveBeenCalledWith(1_000, undefined);
  });

  it("stops after five automatic retries and leaves an unknown outcome for explicit resolution", async () => {
    const inProgress = vi.fn(async () => response(409, { code: "START_IN_PROGRESS" }));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(requestSessionStart(input, { fetcher: inProgress, wait }))
      .rejects.toMatchObject({ code: "START_IN_PROGRESS" });
    expect(inProgress).toHaveBeenCalledTimes(6);
    expect(wait).toHaveBeenCalledTimes(5);

    await expect(requestSessionStart(input, {
      fetcher: vi.fn().mockResolvedValue(response(409, { code: "START_OUTCOME_UNKNOWN" })),
      wait,
    })).rejects.toBeInstanceOf(SessionStartRequestError);
    expect(wait).toHaveBeenCalledTimes(5);
  });
});
