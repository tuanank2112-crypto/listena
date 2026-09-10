import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  profile: vi.fn(),
  attempts: vi.fn(),
  cards: vi.fn(),
  skills: vi.fn(),
  lesson: vi.fn(),
  learningSession: vi.fn(),
  timeline: vi.fn(),
  dashboard: vi.fn(() => null),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/learning/timeline", () => ({ getLearnerTimeline: mocks.timeline }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  learnerProfile: { findUnique: mocks.profile },
  attempt: { findMany: mocks.attempts, findFirst: mocks.attempts },
  flashcard: { count: mocks.cards },
  skillMastery: { findMany: mocks.skills },
  lesson: { findFirst: mocks.lesson },
  learningSession: { findFirst: mocks.learningSession },
} }));
vi.mock("./dashboard-client", () => ({ LearnerDashboard: mocks.dashboard }));

import LearnerDashboardPage from "./page";

describe("LearnerDashboardPage mastery display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1", name: "Learner" } });
    mocks.profile.mockResolvedValue({ listeningMastery: 0.5, vocabularyMastery: 0.5 });
    mocks.attempts.mockResolvedValue([]);
    mocks.cards.mockResolvedValue(0);
    mocks.skills.mockResolvedValue([
      { skillKey: "listening", masteryScore: 0.78 },
      { skillKey: "vocabulary", masteryScore: 2 },
    ]);
    mocks.lesson.mockResolvedValue({ id: "lesson-1", title: "First lesson" });
    mocks.learningSession.mockResolvedValue(null);
    mocks.timeline.mockResolvedValue({ items: [], weeklyStudyTime: 0 });
  });

  it("passes adaptive mastery, not stale profile values, through the client boundary", async () => {
    renderToStaticMarkup(await LearnerDashboardPage());

    expect(mocks.dashboard).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        listeningMastery: 0.78,
        vocabularyMastery: 1,
      }),
    }), undefined);
  });
});
