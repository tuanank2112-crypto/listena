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
  planner: vi.fn(),
  warn: vi.fn(),
  dashboard: vi.fn(() => null),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/learning/timeline", () => ({ getLearnerTimeline: mocks.timeline }));
vi.mock("@/server/learning/planner", () => ({ planNextLearningAction: mocks.planner }));
vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn } }));
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
    mocks.profile.mockResolvedValue({
      listeningMastery: 0.5,
      vocabularyMastery: 0.5,
      calibrationStatus: "UNASSESSED",
    });
    mocks.attempts.mockResolvedValue([]);
    mocks.cards.mockResolvedValue(0);
    mocks.skills.mockResolvedValue([
      { skillKey: "listening", masteryScore: 0.78, evidenceCount: 3 },
      { skillKey: "vocabulary", masteryScore: 2, evidenceCount: 12 },
    ]);
    mocks.lesson.mockResolvedValue({ id: "lesson-1", title: "First lesson" });
    mocks.learningSession.mockResolvedValue(null);
    mocks.timeline.mockResolvedValue({ items: [], weeklyStudyTime: 0 });
    mocks.planner.mockResolvedValue({
      kind: "CALIBRATE",
      scenarioKey: "cafe-order",
      goal: "Start small",
      reasonCode: "NO_EVIDENCE",
      reasonVi: "Bắt đầu một nhiệm vụ ngắn.",
      evidenceRefs: [],
      estimatedMinutes: 10,
      decisionVersion: "p08-v1",
    });
  });

  it("passes adaptive mastery, not stale profile values, through the client boundary", async () => {
    renderToStaticMarkup(await LearnerDashboardPage());

    expect(mocks.dashboard).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        listeningMastery: 0.78,
        vocabularyMastery: 1,
        nextDecision: expect.objectContaining({ kind: "CALIBRATE" }),
        skillObservations: [
          { skillKey: "listening", score: 0.78, evidenceCount: 3, status: "PROVISIONAL" },
          { skillKey: "vocabulary", score: 1, evidenceCount: 12, status: "PROVISIONAL" },
        ],
      }),
    }), undefined);
  });

  it("passes zero-evidence initial skill values to the client as unknown", async () => {
    mocks.skills.mockResolvedValue([
      { skillKey: "listening", masteryScore: 0.5, evidenceCount: 0 },
      { skillKey: "vocabulary", masteryScore: 0.5, evidenceCount: 0 },
    ]);

    renderToStaticMarkup(await LearnerDashboardPage());

    expect(mocks.dashboard).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        skillObservations: [
          { skillKey: "listening", score: null, evidenceCount: 0, status: "UNKNOWN" },
          { skillKey: "vocabulary", score: null, evidenceCount: 0, status: "UNKNOWN" },
        ],
      }),
    }), undefined);
  });

  it("keeps an unavailable planner explicit instead of inventing a Daily Quest", async () => {
    mocks.planner.mockRejectedValue(new Error("read-only planner unavailable"));

    renderToStaticMarkup(await LearnerDashboardPage());

    expect(mocks.dashboard).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nextDecision: null }),
    }), undefined);
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
});
