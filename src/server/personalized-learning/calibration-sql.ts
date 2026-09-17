import type { LibSqlBatchStatement, LibSqlBatchValue } from "@/lib/libsql-batch";
import {
  CALIBRATION_CONFIDENCE,
  CALIBRATION_FINAL_EVIDENCE,
  CALIBRATION_MIN_EVIDENCE,
  CALIBRATION_MIN_SKILLS,
} from "@/server/personalized-learning/calibration";

/**
 * Plan13 SPEC-P132 §5 (finding P1a): the CEFR level may move at most one step,
 * and only at two moments:
 *  (a) the first transition into CALIBRATED, or
 *  (b) a re-check once the profile has been CALIBRATED for at least
 *      CALIBRATION_RECHECK_INTERVAL_MS and at least
 *      CALIBRATION_RECHECK_MIN_EVIDENCE_AFTER_MARK of the 24 most recent
 *      evidence rows were recorded after `calibratedAt`.
 * Each level change (and the first transition) resets `calibratedAt` to now.
 * CALIBRATED is sticky: a dip in qualifying evidence never demotes the status,
 * because a demote/re-promote cycle would count as a new "first transition"
 * and bypass the re-check window.
 * Previously every qualifying attempt shifted a level (A2 -> C2 in one lesson).
 */
export const CALIBRATION_RECHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;
export const CALIBRATION_RECHECK_MIN_EVIDENCE_AFTER_MARK = 12;
export const CALIBRATION_RECENT_EVIDENCE_LIMIT = 24;
const LEVEL_UP_AVERAGE = 0.65;
const LEVEL_DOWN_AVERAGE = 0.35;

export type CalibrationStatementInput = {
  userId: string;
  /** The AdaptiveEvidence row this attempt inserted; the update is fenced on its existence. */
  evidenceId: string;
  /** Timestamps in the libSQL format of the current runtime (`libSqlTimestamp`). */
  now: LibSqlBatchValue;
  /** `now - CALIBRATION_RECHECK_INTERVAL_MS`, same format as `now`. */
  recheckCutoff: LibSqlBatchValue;
};

export function buildPersonalizedCalibrationStatement(
  input: CalibrationStatementInput,
): LibSqlBatchStatement {
  const values: LibSqlBatchValue[] = [];
  const p = (value: LibSqlBatchValue) => {
    values.push(value);
    return "?";
  };

  const qualifyingCount = `(SELECT "qualifyingCount" FROM "calibration")`;
  const qualifyingSkillCount = `(SELECT "qualifyingSkillCount" FROM "calibration")`;
  const averageScore = `(SELECT "averageScore" FROM "calibration")`;
  const afterMarkCount = `(
    SELECT COUNT(*) FROM "recentEvidence"
    WHERE "LearnerProfile"."calibratedAt" IS NULL
      OR "recentEvidence"."createdAt" > "LearnerProfile"."calibratedAt"
  )`;
  const thresholdMet = () =>
    `(${qualifyingSkillCount} >= ${p(CALIBRATION_MIN_SKILLS)} AND ${qualifyingCount} >= ${p(CALIBRATION_FINAL_EVIDENCE)})`;
  const firstTransition = () =>
    `("calibrationStatus" <> 'CALIBRATED' AND ${thresholdMet()})`;
  const recheckAllowed = () =>
    `("calibrationStatus" = 'CALIBRATED'
      AND ("calibratedAt" IS NULL OR "calibratedAt" <= ${p(input.recheckCutoff)})
      AND ${afterMarkCount} >= ${p(CALIBRATION_RECHECK_MIN_EVIDENCE_AFTER_MARK)}
      AND ${thresholdMet()})`;
  const levelChangeAllowed = () => `(${firstTransition()} OR ${recheckAllowed()})`;
  const shiftsLevel = `(${averageScore} >= ${LEVEL_UP_AVERAGE} OR ${averageScore} <= ${LEVEL_DOWN_AVERAGE})`;

  // The SET clauses are evaluated against the pre-update row, so every
  // reference to "calibrationStatus"/"calibratedAt" below sees the old value.
  const sql = `WITH "recentEvidence" AS (
      SELECT "skillKey", "score", "confidence", "createdAt"
      FROM "AdaptiveEvidence"
      WHERE "userId" = ${p(input.userId)}
      ORDER BY "createdAt" DESC
      LIMIT ${CALIBRATION_RECENT_EVIDENCE_LIMIT}
    ),
    "calibration" AS (
      SELECT
        COALESCE(SUM(CASE WHEN "confidence" >= ${p(CALIBRATION_CONFIDENCE)} THEN 1 ELSE 0 END), 0) AS "qualifyingCount",
        COUNT(DISTINCT CASE WHEN "confidence" >= ${p(CALIBRATION_CONFIDENCE)} THEN "skillKey" END) AS "qualifyingSkillCount",
        AVG(CASE WHEN "confidence" >= ${p(CALIBRATION_CONFIDENCE)} THEN "score" END) AS "averageScore"
      FROM "recentEvidence"
    )
    UPDATE "LearnerProfile"
    SET "calibrationStatus" = CASE
          WHEN ${qualifyingSkillCount} < ${p(CALIBRATION_MIN_SKILLS)}
            OR ${qualifyingCount} < ${p(CALIBRATION_MIN_EVIDENCE)}
            THEN CASE WHEN "calibrationStatus" = 'CALIBRATED' THEN 'CALIBRATED' ELSE 'UNASSESSED' END
          WHEN ${qualifyingCount} < ${p(CALIBRATION_FINAL_EVIDENCE)}
            THEN CASE WHEN "calibrationStatus" = 'CALIBRATED' THEN 'CALIBRATED' ELSE 'CALIBRATING' END
          ELSE 'CALIBRATED'
        END,
        "estimatedCefrLevel" = CASE
          WHEN ${levelChangeAllowed()} AND ${averageScore} >= ${LEVEL_UP_AVERAGE}
            THEN CASE "estimatedCefrLevel"
              WHEN 'A1' THEN 'A2' WHEN 'A2' THEN 'B1' WHEN 'B1' THEN 'B2'
              WHEN 'B2' THEN 'C1' WHEN 'C1' THEN 'C2' ELSE 'C2'
            END
          WHEN ${levelChangeAllowed()} AND ${averageScore} <= ${LEVEL_DOWN_AVERAGE}
            THEN CASE "estimatedCefrLevel"
              WHEN 'C2' THEN 'C1' WHEN 'C1' THEN 'B2' WHEN 'B2' THEN 'B1'
              WHEN 'B1' THEN 'A2' WHEN 'A2' THEN 'A1' ELSE 'A1'
            END
          ELSE "estimatedCefrLevel"
        END,
        "calibratedAt" = CASE
          WHEN ${firstTransition()} THEN ${p(input.now)}
          WHEN ${recheckAllowed()} AND ${shiftsLevel} THEN ${p(input.now)}
          ELSE "calibratedAt"
        END,
        "updatedAt" = ${p(input.now)}
    WHERE "userId" = ${p(input.userId)}
      AND EXISTS (SELECT 1 FROM "AdaptiveEvidence" WHERE "id" = ${p(input.evidenceId)})`;

  return { sql, values };
}
