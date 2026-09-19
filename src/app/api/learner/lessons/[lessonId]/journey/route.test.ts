import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseConfigurationError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  lesson: vi.fn(),
  journey: vi.fn(),
  mark: vi.fn(),
  error: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));
vi.mock("@/lib/prisma", () => ({ prisma: { lesson: { findFirst: mocks.lesson } } }));
vi.mock("@/server/learning/lesson-journey", () => ({
  getLessonJourney: mocks.journey,
  markLessonLearned: mocks.mark,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ lessonId: "lesson-1" }) };
const request = new Request("http://localhost/api/learner/lessons/lesson-1/journey");

describe("/api/learner/lessons/[lessonId]/journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.lesson.mockResolvedValue({ id: "lesson-1" });
    mocks.journey.mockResolvedValue({ lessonId: "lesson-1", percent: 20, nextStep: "PRACTICE", isComplete: false, steps: [] });
  });

  it("refuses an anonymous reader before touching the database", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(401);
    expect(mocks.lesson).not.toHaveBeenCalled();
  });

  it("refuses an anonymous writer, and records nothing", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request, context)).status).toBe(401);
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("reports the journey for the caller and this lesson", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ percent: 20, nextStep: "PRACTICE" });
    expect(mocks.journey).toHaveBeenCalledWith("learner-1", "lesson-1");
  });

  it("answers 404 for a lesson that is not published, and writes nothing", async () => {
    mocks.lesson.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(404);
    expect((await POST(request, context)).status).toBe(404);
    expect(mocks.mark).not.toHaveBeenCalled();
    // Only published lessons are readable at all.
    expect(mocks.lesson).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lesson-1", status: "PUBLISHED" },
    }));
  });

  it("records the learn step and answers with the updated journey", async () => {
    mocks.journey.mockResolvedValue({ lessonId: "lesson-1", percent: 40, nextStep: "PLAY", isComplete: false, steps: [] });
    const response = await POST(request, context);
    expect(response.status).toBe(200);
    expect(mocks.mark).toHaveBeenCalledWith("learner-1", "lesson-1");
    await expect(response.json()).resolves.toMatchObject({ percent: 40 });
  });

  it("hands a database configuration failure to the shared opaque response", async () => {
    mocks.journey.mockRejectedValue(new DatabaseConfigurationError());
    const response = await GET(request, context);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await response.json())).not.toContain("Database configuration");
  });
});
