import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/learning-session/start-session-button", () => ({
  StartSessionButton: () => null,
}));

vi.mock("@/components/learner-timeline", () => ({
  LearnerTimeline: () => null,
}));

import { LearnerDashboard } from "./dashboard-client";

const dashboardData = {
  greeting: "Learner",
  activeSession: null,
  continueLessonId: "lesson-1",
  recommendedLesson: null,
  cardsDueToday: 0,
  currentStreak: 0,
  weeklyStudyTime: 12,
  listeningMastery: 0.5,
  vocabularyMastery: 0.5,
  weakSkills: [],
  recentAttempts: [],
  timeline: { items: [], weeklyStudyTime: 12 },
};

describe("LearnerDashboard honest learning state", () => {
  it("shows an unknown state instead of a composite 50 percent ability", () => {
    const html = renderToStaticMarkup(
      <LearnerDashboard
        data={{
          ...dashboardData,
          skillObservations: [
            { skillKey: "listening", score: null, evidenceCount: 0, status: "UNKNOWN" },
            { skillKey: "vocabulary", score: null, evidenceCount: 0, status: "UNKNOWN" },
          ],
        }}
      />,
    );

    expect(html).toContain("Chưa có bằng chứng");
    expect(html).not.toContain("Năng lực");
    expect(html).not.toContain(">50%<");
  });

  it("labels the capped attempt count accurately", () => {
    const html = renderToStaticMarkup(
      <LearnerDashboard
        data={{
          ...dashboardData,
          recentAttempts: [
            { id: "attempt-1", lessonTitle: "Lesson 1", score: 8, createdAt: new Date("2026-09-13T00:00:00.000Z") },
          ],
        }}
      />,
    );

    expect(html).toContain("Bài luyện gần đây");
    expect(html).not.toContain("Lượt học");
  });

  it("keeps a planner outage as an explicit manual Mission choice", () => {
    const html = renderToStaticMarkup(
      <LearnerDashboard data={{ ...dashboardData, nextDecision: null }} />,
    );

    expect(html).toContain("Tự chọn một Mission");
    expect(html).toContain("Planner đang tạm thời chưa sẵn sàng");
    expect(html).not.toContain("Bắt đầu cùng AI");
  });
});
