import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import {
  buildPersonalizedCalibrationStatement,
  CALIBRATION_RECHECK_INTERVAL_MS,
} from "./calibration-sql";

// Plan13 SPEC-P132 §5 (finding P1a): the CEFR level moves one step at a time,
// only on the first CALIBRATED transition or after a 7-day re-check window
// with fresh evidence. Run on a real SQLite so the SQL itself is under test.
const userId = "learner-1";
const day = 24 * 60 * 60 * 1_000;
const now = new Date("2026-09-17T10:00:00.000Z").getTime();
let database: ReturnType<typeof createClient>;
let evidenceSeq = 0;

async function profile() {
  const result = await database.execute({
    sql: `SELECT "estimatedCefrLevel", "calibrationStatus", "calibratedAt" FROM "LearnerProfile" WHERE "userId" = ?`,
    args: [userId],
  });
  return result.rows[0]!;
}

async function recordAttempt(at: number, score = 1, skillKey = evidenceSeq % 2 ? "vocabulary" : "spelling") {
  const id = `evidence-${evidenceSeq += 1}`;
  await database.execute({
    sql: `INSERT INTO "AdaptiveEvidence" ("id", "userId", "skillKey", "score", "confidence", "createdAt") VALUES (?, ?, ?, ?, 1, ?)`,
    args: [id, userId, skillKey, score, at],
  });
  const statement = buildPersonalizedCalibrationStatement({
    userId,
    evidenceId: id,
    now: at,
    recheckCutoff: at - CALIBRATION_RECHECK_INTERVAL_MS,
  });
  await database.execute({ sql: statement.sql, args: statement.values });
}

beforeEach(async () => {
  evidenceSeq = 0;
  database = createClient({ url: "file::memory:" });
  await database.batch([
    { sql: `CREATE TABLE "LearnerProfile" ("userId" TEXT PRIMARY KEY, "estimatedCefrLevel" TEXT NOT NULL, "calibrationStatus" TEXT NOT NULL, "calibratedAt" INTEGER, "updatedAt" INTEGER NOT NULL)`, args: [] },
    { sql: `CREATE TABLE "AdaptiveEvidence" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "skillKey" TEXT NOT NULL, "score" REAL NOT NULL, "confidence" REAL NOT NULL, "createdAt" INTEGER NOT NULL)`, args: [] },
  ], "write");
});

afterEach(async () => {
  await database.close();
});

describe("personalized calibration SQL", () => {
  it("moves exactly one level on the first CALIBRATED transition and stamps calibratedAt", async () => {
    await database.execute({
      sql: `INSERT INTO "LearnerProfile" VALUES (?, 'A2', 'UNASSESSED', NULL, ?)`,
      args: [userId, now - 10 * day],
    });
    for (let index = 0; index < 11; index += 1) await recordAttempt(now - 1_000 + index);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "A2", calibrationStatus: "CALIBRATING" });

    await recordAttempt(now);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "B1", calibrationStatus: "CALIBRATED", calibratedAt: now });
  });

  it("changes the level once after a re-check window and never again the same day", async () => {
    // Regression for P1a: the old statement shifted a level on every attempt.
    const mark = now - 8 * day;
    await database.execute({
      sql: `INSERT INTO "LearnerProfile" VALUES (?, 'A2', 'CALIBRATED', ?, ?)`,
      args: [userId, mark, mark],
    });
    // Ten qualifying attempts after the mark; the re-check needs twelve.
    for (let index = 0; index < 10; index += 1) await recordAttempt(mark + (index + 1) * 60_000);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "A2", calibratedAt: mark });

    // Five correct attempts in a row: the level moves exactly once (at the
    // twelfth post-mark evidence) and calibratedAt is reset, so the remaining
    // attempts cannot move it again.
    const levels: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      await recordAttempt(now + index * 1_000);
      levels.push(String((await profile()).estimatedCefrLevel));
    }
    expect(levels).toEqual(["A2", "B1", "B1", "B1", "B1"]);
    expect(await profile()).toMatchObject({ calibrationStatus: "CALIBRATED", calibratedAt: now + 1_000 });

    // Five more correct attempts the same day: no change (window not elapsed).
    for (let index = 0; index < 5; index += 1) await recordAttempt(now + 60_000 + index * 1_000);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "B1", calibratedAt: now + 1_000 });
  });

  it("does not re-check when fewer than twelve evidence rows postdate the mark, even after seven days", async () => {
    const mark = now - 30 * day;
    await database.execute({
      sql: `INSERT INTO "LearnerProfile" VALUES (?, 'B1', 'CALIBRATED', ?, ?)`,
      args: [userId, mark, mark],
    });
    // Historical evidence before the mark (seeded directly, not re-graded).
    for (let index = 0; index < 12; index += 1) {
      await database.execute({
        sql: `INSERT INTO "AdaptiveEvidence" ("id", "userId", "skillKey", "score", "confidence", "createdAt") VALUES (?, ?, ?, 1, 1, ?)`,
        args: [`history-${index}`, userId, index % 2 ? "vocabulary" : "spelling", mark - (index + 1) * 60_000],
      });
    }
    for (let index = 0; index < 11; index += 1) await recordAttempt(now + index);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "B1", calibratedAt: mark });
  });

  it("keeps CALIBRATED sticky so a dip in qualifying evidence cannot re-trigger a first transition", async () => {
    const mark = now - 1 * day;
    await database.execute({
      sql: `INSERT INTO "LearnerProfile" VALUES (?, 'B1', 'CALIBRATED', ?, ?)`,
      args: [userId, mark, mark],
    });
    // Twenty low-confidence rows push every qualifying row out of the recent 24.
    for (let index = 0; index < 20; index += 1) {
      await database.execute({
        sql: `INSERT INTO "AdaptiveEvidence" ("id", "userId", "skillKey", "score", "confidence", "createdAt") VALUES (?, ?, 'listening', 0.5, 0.2, ?)`,
        args: [`weak-${index}`, userId, now - 60_000 + index],
      });
    }
    for (let index = 0; index < 11; index += 1) await recordAttempt(now + index);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "B1", calibrationStatus: "CALIBRATED", calibratedAt: mark });
  });

  it("steps down one level on a poor re-check instead of dropping several", async () => {
    const mark = now - 8 * day;
    await database.execute({
      sql: `INSERT INTO "LearnerProfile" VALUES (?, 'B2', 'CALIBRATED', ?, ?)`,
      args: [userId, mark, mark],
    });
    for (let index = 0; index < 14; index += 1) await recordAttempt(now + index, 0);
    expect(await profile()).toMatchObject({ estimatedCefrLevel: "B1", calibrationStatus: "CALIBRATED", calibratedAt: now + 11 });
  });
});
