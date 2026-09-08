import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  sessions: vi.fn(),
  evidence: vi.fn(),
  attempts: vi.fn(),
  reviews: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  learningSession: { findMany: db.sessions },
  learningEvidence: { findMany: db.evidence },
  attempt: { findMany: db.attempts },
  reviewLog: { findMany: db.reviews },
} }));

import { getLearnerTimeline } from "./timeline";

const now = new Date("2026-09-08T12:00:00.000Z");

describe("getLearnerTimeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    db.sessions.mockReset();
    db.evidence.mockReset();
    db.attempts.mockReset();
    db.reviews.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("returns owner-scoped public activity, caps display rows, and aggregates every weekly session", async () => {
    const displaySessions = Array.from({ length: 50 }, (_, index) => ({
      id: `session-${index}`,
      completedAt: new Date(now.getTime() - (20 + index) * 60_000),
    }));
    const weeklySessions = Array.from({ length: 51 }, () => ({
      startedAt: new Date(now.getTime() - 2 * 60_000),
      completedAt: now,
    }));
    db.sessions.mockResolvedValueOnce(displaySessions).mockResolvedValueOnce(weeklySessions);
    db.evidence.mockResolvedValue([{ id: "evidence", createdAt: new Date(now.getTime() - 1_000), score: .75, skillKey: "LISTENING" }]);
    db.attempts.mockResolvedValue([{ id: "attempt", createdAt: new Date(now.getTime() - 2_000), score: 88 }]);
    db.reviews.mockResolvedValue([{ id: "review", reviewedAt: new Date(now.getTime() - 3_000) }]);

    const result = await getLearnerTimeline("learner-1");

    expect(result.items).toHaveLength(50);
    expect(result.items.slice(0, 3).map((item) => item.kind)).toEqual(["EVIDENCE", "ATTEMPT", "REVIEW"]);
    expect(new Set(result.items.map((item) => item.kind))).toEqual(new Set(["SESSION", "EVIDENCE", "ATTEMPT", "REVIEW"]));
    expect(result.items.every((item) => !("content" in item) && !("answer" in item))).toBe(true);
    expect(result.weeklyStudyTime).toBe(102);

    const [displayQuery, weeklyQuery] = db.sessions.mock.calls.map(([query]) => query);
    expect(displayQuery).toMatchObject({
      where: { userId: "learner-1", status: "COMPLETED", completedAt: { gte: new Date("2026-09-01T12:00:00.000Z"), lte: now } },
      take: 50,
    });
    expect(weeklyQuery).toMatchObject({
      where: { userId: "learner-1", status: "COMPLETED", completedAt: { gte: new Date("2026-09-01T12:00:00.000Z"), lte: now } },
    });
    expect(weeklyQuery).not.toHaveProperty("take");
    expect(db.evidence).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ session: { userId: "learner-1" } }), take: 50 }));
    expect(db.attempts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "learner-1" }), take: 50 }));
    expect(db.reviews).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "learner-1" }), take: 50 }));
  });

  it("uses a thirty-day display window without changing the seven-day aggregate and excludes future rows", async () => {
    db.sessions.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.evidence.mockResolvedValue([]);
    db.attempts.mockResolvedValue([]);
    db.reviews.mockResolvedValue([]);

    await expect(getLearnerTimeline("learner-2", 30)).resolves.toEqual({ items: [], weeklyStudyTime: 0 });

    const [displayQuery, weeklyQuery] = db.sessions.mock.calls.map(([query]) => query);
    expect(displayQuery.where.completedAt).toEqual({ gte: new Date("2026-08-09T12:00:00.000Z"), lte: now });
    expect(weeklyQuery.where.completedAt).toEqual({ gte: new Date("2026-09-01T12:00:00.000Z"), lte: now });
    expect(db.evidence.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date("2026-08-09T12:00:00.000Z"), lte: now });
  });
});
