import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { exercise: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error, warn: mocks.warn, info: vi.fn() } }));

import { POST } from "./route";

const EXERCISE_ID = "00000000-0000-4000-8000-000000000001";
const LESSON_ID = "00000000-0000-4000-8000-000000000002";
const CLIENT_ATTEMPT_ID = "00000000-0000-4000-8000-000000000003";

function request(body: unknown) {
  return new Request("http://localhost/api/attempt/assist", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function exerciseRow(overrides: Partial<{ lessonId: string; status: string; metadata: string | null; correctAnswer: string }> = {}) {
  return {
    id: EXERCISE_ID,
    lessonId: overrides.lessonId ?? LESSON_ID,
    correctAnswer: overrides.correctAnswer ?? "They went to Da Nang.",
    metadata: overrides.metadata === undefined ? JSON.stringify({ answerMode: "guided" }) : overrides.metadata,
    lesson: {
      status: overrides.status ?? "PUBLISHED",
      transcript: "Last summer my family went to Da Nang. We swam in the sea and built sandcastles on the beach.",
      vocabulary: [{ vocabularyItem: { displayText: "beach" } }, { vocabularyItem: { displayText: "hotel" } }],
    },
  };
}

const validBody = { exerciseId: EXERCISE_ID, lessonId: LESSON_ID, clientAttemptId: CLIENT_ATTEMPT_ID, mode: "TILES" };

describe("POST /api/attempt/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
    mocks.findUnique.mockResolvedValue(exerciseRow());
  });

  it("returns 401 UNAUTHENTICATED without a session and 403 ROLE_FORBIDDEN for teachers", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const anonymous = await POST(request(validBody));
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({ code: "UNAUTHENTICATED" });

    mocks.auth.mockResolvedValueOnce({ user: { id: "teacher-1", role: "TEACHER" } });
    const teacher = await POST(request(validBody));
    expect(teacher.status).toBe(403);
    await expect(teacher.json()).resolves.toMatchObject({ code: "ROLE_FORBIDDEN" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON, bad uuids and unknown modes", async () => {
    const malformed = await POST(request("{not json"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });

    const badMode = await POST(request({ ...validBody, mode: "ANSWER" }));
    expect(badMode.status).toBe(400);

    const badId = await POST(request({ ...validBody, clientAttemptId: "nope" }));
    expect(badId.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for missing, mismatched, unpublished and open-answer exercises", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await POST(request(validBody))).status).toBe(404);

    mocks.findUnique.mockResolvedValueOnce(exerciseRow({ lessonId: "00000000-0000-4000-8000-000000000009" }));
    expect((await POST(request(validBody))).status).toBe(404);

    mocks.findUnique.mockResolvedValueOnce(exerciseRow({ status: "DRAFT" }));
    expect((await POST(request(validBody))).status).toBe(404);

    mocks.findUnique.mockResolvedValueOnce(exerciseRow({ metadata: JSON.stringify({ answerMode: "open" }) }));
    const open = await POST(request(validBody));
    expect(open.status).toBe(404);
    await expect(open.json()).resolves.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 200 with deterministic tiles that never spell the answer in order and no answer text", async () => {
    const first = await POST(request(validBody));
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    const payload = await first.json() as { mode: string; hintCost: number; tiles: string[]; skeleton?: unknown };
    expect(payload).toMatchObject({ mode: "TILES", hintCost: 2 });
    expect(payload.skeleton).toBeUndefined();
    expect(payload.tiles).toHaveLength(7);
    const answerWords = ["they", "went", "to", "da", "nang"];
    expect(payload.tiles.filter((tile) => answerWords.includes(tile))).not.toEqual(answerWords);
    expect(payload.tiles.filter((tile) => !answerWords.includes(tile))).toHaveLength(2);

    const replay = await POST(request(validBody));
    await expect(replay.json()).resolves.toEqual(payload);

    const skeleton = await POST(request({ ...validBody, mode: "SKELETON" }));
    expect(skeleton.status).toBe(200);
    const skeletonPayload = await skeleton.json() as { hintCost: number; skeleton: Array<{ length: number; first?: string }>; tiles?: unknown };
    expect(skeletonPayload.hintCost).toBe(1);
    expect(skeletonPayload.tiles).toBeUndefined();
    expect(skeletonPayload.skeleton.map((slot) => slot.length)).toEqual([4, 4, 2, 2, 4]);
    expect(skeletonPayload.skeleton.filter((slot) => slot.first).length).toBeLessThanOrEqual(1);
    expect(JSON.stringify(skeletonPayload)).not.toContain("nang");
  });

  it("returns an opaque 503 when the database is unavailable", async () => {
    mocks.findUnique.mockRejectedValueOnce(new DatabaseUnavailableError());
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
