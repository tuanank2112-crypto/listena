import { describe, expect, it } from "vitest";
import {
  LESSON_JOURNEY_STEPS,
  deriveCompletedSteps,
  describeJourneyStep,
  isLessonJourneyStep,
  summariseJourney,
} from "./lesson-journey";

describe("the path itself", () => {
  it("is the five steps of the reference app, in order", () => {
    expect(LESSON_JOURNEY_STEPS).toEqual(["LEARN", "PRACTICE", "PLAY", "LISTEN", "TEST"]);
  });

  it("describes every step in Vietnamese and numbers it from one", () => {
    for (const [index, step] of LESSON_JOURNEY_STEPS.entries()) {
      const info = describeJourneyStep(step);
      expect(info.order).toBe(index + 1);
      expect(info.labelVi.length).toBeGreaterThan(0);
      expect(info.ctaVi.length).toBeGreaterThan(0);
      // The learner reads these; no step name may leak through untranslated.
      expect(info.labelVi).not.toBe(step);
    }
  });
});

describe("isLessonJourneyStep", () => {
  it("accepts a real step and refuses anything else", () => {
    expect(isLessonJourneyStep("PLAY")).toBe(true);
    expect(isLessonJourneyStep("play")).toBe(false);
    expect(isLessonJourneyStep("DANCE")).toBe(false);
    expect(isLessonJourneyStep(null)).toBe(false);
    expect(isLessonJourneyStep(3)).toBe(false);
  });
});

describe("summariseJourney", () => {
  it("starts a learner at the first step with nothing done", () => {
    expect(summariseJourney([])).toEqual({
      completed: [],
      percent: 0,
      nextStep: "LEARN",
      isComplete: false,
    });
  });

  it("advances through the path as steps are finished", () => {
    expect(summariseJourney(["LEARN"])).toMatchObject({ percent: 20, nextStep: "PRACTICE" });
    expect(summariseJourney(["LEARN", "PRACTICE", "PLAY"])).toMatchObject({ percent: 60, nextStep: "LISTEN" });
  });

  it("closes the journey when every step is done", () => {
    expect(summariseJourney([...LESSON_JOURNEY_STEPS])).toMatchObject({
      percent: 100,
      nextStep: null,
      isComplete: true,
    });
  });

  it("sends a learner who jumped ahead back to the step they skipped", () => {
    // Finishing PLAY early must not carry them past the LEARN they never did.
    expect(summariseJourney(["PLAY", "LISTEN"])).toMatchObject({
      percent: 40,
      nextStep: "LEARN",
    });
  });

  it("reports completed steps in path order, not the order they were finished", () => {
    expect(summariseJourney(["TEST", "LEARN", "PLAY"]).completed).toEqual(["LEARN", "PLAY", "TEST"]);
  });

  it("ignores a step name it does not know", () => {
    // A row written by a newer deploy must not break an older page.
    expect(summariseJourney(["LEARN", "TELEPORT"])).toMatchObject({ percent: 20, nextStep: "PRACTICE" });
  });

  it("counts a repeated step once", () => {
    expect(summariseJourney(["LEARN", "LEARN", "LEARN"]).percent).toBe(20);
  });
});

describe("deriveCompletedSteps", () => {
  const evidence = (overrides: Partial<Parameters<typeof deriveCompletedSteps>[0]> = {}) => ({
    storedSteps: [] as string[],
    exerciseCount: 3,
    bestScoreByExercise: new Map<string, number>(),
    completedRunModes: [] as string[],
    ...overrides,
  });

  it("only counts LEARN when it was recorded, because nothing else proves it", () => {
    expect(deriveCompletedSteps(evidence())).not.toContain("LEARN");
    expect(deriveCompletedSteps(evidence({ storedSteps: ["LEARN"] }))).toContain("LEARN");
  });

  it("counts PRACTICE from a single attempt on the lesson", () => {
    expect(deriveCompletedSteps(evidence({
      bestScoreByExercise: new Map([["ex1", 20]]),
    }))).toContain("PRACTICE");
  });

  it("counts PLAY and LISTEN from completed runs of the matching mode", () => {
    expect(deriveCompletedSteps(evidence({ completedRunModes: ["MATCH"] }))).toContain("PLAY");
    expect(deriveCompletedSteps(evidence({ completedRunModes: ["SPELL"] }))).toContain("LISTEN");
    // A quiz run belongs to neither step.
    expect(deriveCompletedSteps(evidence({ completedRunModes: ["QUIZ"] })))
      .toEqual(expect.not.arrayContaining(["PLAY", "LISTEN"]));
  });

  it("closes TEST only when every exercise has been passed", () => {
    const passedTwo = new Map([["ex1", 100], ["ex2", 90]]);
    expect(deriveCompletedSteps(evidence({ bestScoreByExercise: passedTwo }))).not.toContain("TEST");

    const passedAll = new Map([["ex1", 100], ["ex2", 90], ["ex3", 80]]);
    expect(deriveCompletedSteps(evidence({ bestScoreByExercise: passedAll }))).toContain("TEST");
  });

  it("does not close TEST when one exercise is below the bar", () => {
    const nearlyAll = new Map([["ex1", 100], ["ex2", 100], ["ex3", 79]]);
    expect(deriveCompletedSteps(evidence({ bestScoreByExercise: nearlyAll }))).not.toContain("TEST");
  });

  it("never closes TEST on a lesson with no exercises", () => {
    // Otherwise an empty lesson would award the final step for nothing.
    expect(deriveCompletedSteps(evidence({ exerciseCount: 0 }))).not.toContain("TEST");
  });

  it("returns the steps in path order", () => {
    expect(deriveCompletedSteps(evidence({
      storedSteps: ["LEARN"],
      completedRunModes: ["SPELL", "MATCH"],
      bestScoreByExercise: new Map([["ex1", 100], ["ex2", 100], ["ex3", 100]]),
    }))).toEqual(["LEARN", "PRACTICE", "PLAY", "LISTEN", "TEST"]);
  });
});
