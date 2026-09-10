import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findLesson: vi.fn(),
  createInteraction: vi.fn(),
  createProvider: vi.fn(),
  getDatasetUnit: vi.fn(),
  searchKnowledge: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lesson: { findUnique: mocks.findLesson },
    aIInteraction: { create: mocks.createInteraction },
  },
}));
vi.mock("@/server/dataset/catalog", () => ({
  getDatasetUnit: mocks.getDatasetUnit,
  searchKnowledge: mocks.searchKnowledge,
}));
vi.mock("@/server/ai/openai-responses-provider", () => ({
  createConfiguredOpenAIResponsesProvider: mocks.createProvider,
}));

import { POST } from "./route";

describe("POST /api/tutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.findLesson.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      title: "Lesson One",
      topic: "food",
      cefrLevel: "A2",
      status: "PUBLISHED",
      transcript: "The learner orders tea.",
      vocabulary: [],
    });
    mocks.getDatasetUnit.mockReturnValue(null);
    mocks.createProvider.mockReturnValue(undefined);
  });

  it("fails closed instead of returning dataset retrieval copy when live AI is absent", async () => {
    const response = await POST(
      new Request("http://localhost/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: "00000000-0000-4000-8000-000000000001",
          question: "What does tea mean?",
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Gia sư AI hiện chưa sẵn sàng. Vui lòng thử lại sau.",
      code: "AI_UNAVAILABLE",
    });
    expect(mocks.createInteraction).not.toHaveBeenCalled();
  });
});
