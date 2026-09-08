import { describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("@/lib/logger", () => ({ default: logger }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  appendEvidenceToMemory,
  parseLearnerMemory,
  type LearnerMemoryRecord,
} from "./repository";

const record: LearnerMemoryRecord = {
  id: "memory-one",
  userId: "learner-one",
  goalsJson: JSON.stringify([
    { text: "Use travel vocabulary", evidenceIds: ["evidence-old"], updatedAt: "2026-09-08T00:00:00.000Z" },
  ]),
  errorsJson: JSON.stringify([{ errorType: "GRAMMAR", count: 2, lastEvidenceId: "evidence-old" }]),
  skillsJson: JSON.stringify([{ skillKey: "grammar", masteryScore: 0.45, evidenceCount: 2 }]),
  preferencesJson: JSON.stringify({ topics: ["travel"], pace: "slow" }),
};

describe("learner memory validation", () => {
  it("keeps only structurally valid entries and logs field names without raw learner content", () => {
    const parsed = parseLearnerMemory({
      ...record,
      goalsJson: JSON.stringify([
        JSON.parse(record.goalsJson)[0],
        { text: 42, evidenceIds: [], updatedAt: "not-a-date" },
      ]),
      errorsJson: "not-json",
      skillsJson: JSON.stringify([
        JSON.parse(record.skillsJson)[0],
        { skillKey: "grammar", masteryScore: 9, evidenceCount: 0 },
      ]),
      preferencesJson: JSON.stringify({ topics: ["travel"], nested: { private: "discard" } }),
    });

    expect(parsed.goals).toEqual([JSON.parse(record.goalsJson)[0]]);
    expect(parsed.recurringErrors).toEqual([]);
    expect(parsed.provenSkills).toEqual([JSON.parse(record.skillsJson)[0]]);
    expect(parsed.preferences).toEqual({ topics: ["travel"] });
    expect(logger.warn).toHaveBeenCalledWith(
      { memoryField: expect.any(String) },
      "Ignoring structurally invalid learner memory",
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private");
  });
});

describe("transactional evidence append", () => {
  it("uses the supplied evidence ID and updates only evidence-derived JSON", async () => {
    const tx = {
      learnerMemory: {
        findUnique: vi.fn().mockResolvedValue(record),
        upsert: vi.fn(async ({ update }: { update: { errorsJson: string; skillsJson: string } }) => ({
          ...record,
          ...update,
        })),
      },
    };

    const result = await appendEvidenceToMemory(tx as never, record.userId, {
      id: "evidence-new",
      skillKey: "grammar",
      score: 0.82,
      errorType: "GRAMMAR",
    });

    expect(tx.learnerMemory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        errorsJson: expect.stringContaining("evidence-new"),
        skillsJson: expect.stringContaining("evidence-new"),
      }),
    }));
    const upsertCall = tx.learnerMemory.upsert.mock.calls[0][0];
    expect(upsertCall.update).not.toHaveProperty("goalsJson");
    expect(upsertCall.update).not.toHaveProperty("preferencesJson");
    expect(result.goals).toEqual(JSON.parse(record.goalsJson));
    expect(result.preferences).toEqual(JSON.parse(record.preferencesJson));
    expect(result.recurringErrors).toEqual([{ errorType: "GRAMMAR", count: 3, lastEvidenceId: "evidence-new" }]);
    expect(result.provenSkills).toEqual([{
      skillKey: "grammar", masteryScore: 0.82, evidenceCount: 3, lastEvidenceId: "evidence-new",
    }]);
  });
});
