import { describe, expect, it } from "vitest";
import { getLessonProgress } from "./history";

describe("getLessonProgress", () => {
  it("marks untouched lessons as new", () => {
    expect(getLessonProgress("lesson-1", [], [])).toEqual({
      completed: false,
      isNew: true,
      score: 0,
    });
  });

  it("uses the most recent graded attempt", () => {
    const progress = getLessonProgress("lesson-1", [
      { lessonId: "lesson-1", score: 40, createdAt: new Date("2026-09-01") },
      { lessonId: "lesson-1", score: 80, createdAt: new Date("2026-09-02") },
    ], []);

    expect(progress).toEqual({ completed: true, isNew: false, score: 80 });
  });

  it("uses evidence from a more recent learning session", () => {
    const progress = getLessonProgress("lesson-1", [
      { lessonId: "lesson-1", score: 90, createdAt: new Date("2026-09-01") },
    ], [{
      lessonId: "lesson-1",
      status: "COMPLETED",
      updatedAt: new Date("2026-09-02"),
      completedAt: new Date("2026-09-02"),
      evidence: [{ score: 0.5 }, { score: 0.7 }],
    }]);

    expect(progress.completed).toBe(true);
    expect(progress.isNew).toBe(false);
    expect(progress.score).toBeCloseTo(60);
  });
});
