import { describe, expect, it } from "vitest";
import {
  createGameAnswerRequest,
  createGameRunRequest,
  friendlyGameApiError,
} from "./client-contract";

describe("adaptive-game client contract", () => {
  it("maps the familiar UI forms to only the server-issued run modes", () => {
    expect(createGameRunRequest("quiz")).toEqual({ mode: "QUIZ" });
    expect(createGameRunRequest("match")).toEqual({ mode: "MATCH" });
    expect(createGameRunRequest("spell")).toEqual({ mode: "SPELL" });
  });

  it("submits an answer and idempotency key without a correctness claim", () => {
    const payload = createGameAnswerRequest({
      roundId: "round-1",
      answer: ["card-a", "card-b"],
      clientAnswerId: "answer-1",
      responseTimeMs: 700_000,
    });

    expect(payload).toEqual({
      roundId: "round-1",
      answer: ["card-a", "card-b"],
      clientAnswerId: "answer-1",
      responseTimeMs: 600_000,
    });
    expect(payload).not.toHaveProperty("correct");
  });

  it("explains a retired legacy endpoint without retrying it", () => {
    expect(friendlyGameApiError(410, { error: "GAME_SESSION_RETIRED" }))
      .toContain("bắt đầu một lượt game mới");
  });

  it("shows the server retry window when fresh game creation is rate limited", () => {
    expect(friendlyGameApiError(429, {
      error: "GAME_RATE_LIMIT",
      message: "Bạn vừa tạo một lượt game.",
      retryAfterSeconds: 10,
    })).toContain("10 giây");
    expect(friendlyGameApiError(429, { error: "GAME_RATE_LIMIT" }, "65"))
      .toContain("2 phút");
  });
});
