import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), timeline: vi.fn(), error: vi.fn(),
  profile: vi.fn(), skills: vi.fn(), attempts: vi.fn(), cards: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/learning/timeline", () => ({ getLearnerTimeline: mocks.timeline }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  learnerProfile: { findUnique: mocks.profile },
  skillMastery: { findMany: mocks.skills },
  attempt: { findMany: mocks.attempts },
  flashcard: { count: mocks.cards },
} }));

import { GET } from "./route";

describe("GET /api/learner/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.timeline.mockResolvedValue({ items: [], weeklyStudyTime: 47 });
    mocks.profile.mockResolvedValue(null);
    mocks.skills.mockResolvedValue([]);
    mocks.attempts.mockResolvedValue([]);
    mocks.cards.mockResolvedValue(2);
  });

  it("shares the uncapped timeline weekly total and counts never-reviewed cards as due", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ weeklyStudyTime: 47, cardsDueToday: 2 });
    expect(mocks.timeline).toHaveBeenCalledWith("learner-1");
    expect(mocks.cards).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      userId: "learner-1",
      OR: expect.arrayContaining([expect.objectContaining({ vocabularyItem: { mastery: { none: { userId: "learner-1" } } } })]),
    }) }));
  });
});
