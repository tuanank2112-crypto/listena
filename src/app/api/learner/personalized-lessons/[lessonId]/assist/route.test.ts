import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findFirst: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { personalizedLesson: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/personalized-learning/service", () => ({
  PersonalizedLearningError: class PersonalizedLearningError extends Error {},
}));

import { POST } from "./route";

const LESSON_ID = "00000000-0000-4000-8000-000000000010";

function request(body: unknown) {
  return new Request(`http://localhost/api/learner/personalized-lessons/${LESSON_ID}/assist`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ lessonId: LESSON_ID }) };

function lessonRow() {
  return {
    contentJson: JSON.stringify({
      introVi: "Giới thiệu",
      transcript: "We booked a room at the Sunrise Hotel and asked for a late checkout.",
      vocabulary: [
        { id: "00000000-0000-4000-8000-000000000101", lemma: "checkout", displayText: "checkout", meaningVi: "trả phòng", cefrLevel: "A2", isTarget: true, importance: 1 },
        { id: "00000000-0000-4000-8000-000000000102", lemma: "booked", displayText: "booked", meaningVi: "đã đặt", cefrLevel: "A2", isTarget: true, importance: 1 },
      ],
      exercises: [
        { id: "exercise-1", type: "FILL", prompt: "We ___ a room." },
        { id: "exercise-2", type: "CHOICE", prompt: "Pick one", options: ["room", "hotel"] },
      ],
    }),
    validatorJson: JSON.stringify({
      exercises: [
        { id: "exercise-1", acceptedAnswers: ["booked a room"], feedbackVi: "Đúng rồi" },
        { id: "exercise-2", acceptedAnswers: ["room"], feedbackVi: "Ok" },
      ],
    }),
  };
}

const body = { exerciseId: "exercise-1", clientAttemptId: "client-attempt-0001", mode: "SKELETON" };

describe("POST /api/learner/personalized-lessons/{id}/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
    mocks.findFirst.mockResolvedValue(lessonRow());
  });

  it("returns 401 without a session and 403 ROLE_FORBIDDEN for teachers", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST(request(body), context)).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ user: { id: "t", role: "TEACHER" } });
    const forbidden = await POST(request(body), context);
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ code: "ROLE_FORBIDDEN" });
  });

  it("returns 400 VALIDATION_ERROR for a bad body and 404 PRIVATE_NOT_FOUND for unowned/CHOICE exercises", async () => {
    const invalid = await POST(request({ ...body, exerciseId: "exercise-9" }), context);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });

    mocks.findFirst.mockResolvedValueOnce(null);
    expect((await POST(request(body), context)).status).toBe(404);
    expect(mocks.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: LESSON_ID, userId: "learner-1", status: "READY" } }),
    );

    const choice = await POST(request({ ...body, exerciseId: "exercise-2" }), context);
    expect(choice.status).toBe(404);
    await expect(choice.json()).resolves.toMatchObject({ code: "PRIVATE_NOT_FOUND" });
  });

  it("returns a deterministic skeleton / tiles payload from the validator answer", async () => {
    const skeleton = await POST(request(body), context);
    expect(skeleton.status).toBe(200);
    const payload = await skeleton.json() as { hintCost: number; skeleton: Array<{ length: number; first?: string }> };
    expect(payload.hintCost).toBe(1);
    expect(payload.skeleton.map((slot) => slot.length)).toEqual([6, 1, 4]);
    expect(payload.skeleton.filter((slot) => slot.first)).toHaveLength(1);

    const tiles = await POST(request({ ...body, mode: "TILES" }), context);
    const tilesPayload = await tiles.json() as { hintCost: number; tiles: string[] };
    expect(tilesPayload.hintCost).toBe(2);
    expect(tilesPayload.tiles).toHaveLength(5);
    expect(tilesPayload.tiles.filter((tile) => ["booked", "a", "room"].includes(tile))).not.toEqual(["booked", "a", "room"]);
    await expect((await POST(request({ ...body, mode: "TILES" }), context)).json()).resolves.toEqual(tilesPayload);
  });
});
