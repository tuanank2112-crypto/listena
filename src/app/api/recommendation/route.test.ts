import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  profile: vi.fn(),
  skills: vi.fn(),
  lessons: vi.fn(),
  vocabDue: vi.fn(),
  attempts: vi.fn(),
  learningSessions: vi.fn(),
  recommendation: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learnerProfile: { findUnique: mocks.profile },
    skillMastery: { findMany: mocks.skills },
    lesson: { findMany: mocks.lessons },
    vocabularyMastery: { count: mocks.vocabDue },
    attempt: { findMany: mocks.attempts },
    learningSession: { findMany: mocks.learningSessions },
    recommendation: { upsert: mocks.recommendation },
  },
}));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error, info: mocks.info } }));

import { GET } from "./route";

describe("GET /api/recommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.profile.mockResolvedValue(null);
    mocks.skills.mockResolvedValue([]);
    mocks.lessons.mockResolvedValue([]);
    mocks.vocabDue.mockResolvedValue(0);
    mocks.attempts.mockResolvedValue([]);
    mocks.learningSessions.mockResolvedValue([]);
    mocks.recommendation.mockResolvedValue({});
  });

  it("returns an opaque 503 when its database read fails", async () => {
    mocks.profile.mockRejectedValue(new DatabaseUnavailableError());

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
