import { describe, expect, it } from "vitest";
import {
  parseLearnerIntentPayload,
  toLearnerIntentDraft,
  validateLearnerIntentDraft,
} from "./types";

describe("learner intent client contract", () => {
  it("keeps an explicit empty goal and topics as a valid clearing request", () => {
    const result = validateLearnerIntentDraft({
      goal: "   ",
      dailyMinutes: 10,
      preferredTopics: [],
      revision: "snapshot-1",
    });

    expect(result).toEqual({
      ok: true,
      value: { goal: null, dailyMinutes: 10, preferredTopics: [], revision: "snapshot-1" },
    });
  });

  it("rejects duplicate or oversized topics before sending a PUT", () => {
    const duplicate = validateLearnerIntentDraft({
      goal: "Travel confidently",
      dailyMinutes: 10,
      preferredTopics: ["Travel", " travel "],
      revision: null,
    });
    const oversized = validateLearnerIntentDraft({
      goal: "Travel confidently",
      dailyMinutes: 10,
      preferredTopics: Array.from({ length: 9 }, (_, index) => `Topic ${index}`),
      revision: null,
    });

    expect(duplicate).toMatchObject({ ok: false, field: "preferredTopics" });
    expect(oversized).toMatchObject({ ok: false, field: "preferredTopics" });
  });

  it("accepts only a complete typed API payload", () => {
    const payload = parseLearnerIntentPayload({
      goal: "Speak more naturally at work",
      dailyMinutes: 15,
      preferredTopics: ["Work", "Meetings"],
      revision: "opaque-revision",
    });

    expect(payload).toEqual({
      goal: "Speak more naturally at work",
      dailyMinutes: 15,
      preferredTopics: ["Work", "Meetings"],
      revision: "opaque-revision",
    });
    expect(toLearnerIntentDraft(payload!)).toMatchObject({ goal: "Speak more naturally at work" });
    expect(parseLearnerIntentPayload({ dailyMinutes: 7 })).toBeNull();
  });
});
