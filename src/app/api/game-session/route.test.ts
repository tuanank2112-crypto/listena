import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/game-session", () => {
  it("is retired and cannot turn a browser correct flag into mastery", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "GAME_SESSION_RETIRED" });
  });
});

