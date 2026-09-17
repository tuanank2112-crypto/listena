import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

export const LEARNING_DATASET_VERSION = "learning-cases-v1";
export const LEARNING_PROMPT_VERSION = "tutor-prompt-p11-v1";

export const LearningEvalTurnSchema = z.object({
  learnerMessage: z.string().min(1),
  expectationId: z.string().min(1),
});

export const LearningEvalCaseSchema = z.object({
  caseId: z.string().min(1),
  mode: z.enum(["MISSION", "LESSON_COACH", "DAILY_QUEST"]),
  learnerGoal: z.string().min(1),
  turns: z.array(LearningEvalTurnSchema).min(3),
  rubricVersion: z.string().min(1),
  synthetic: z.literal(true),
  metadata: z
    .object({
      topic: z.string().optional(),
      targetSkill: z.string().optional(),
      scenarioKey: z.string().optional(),
      lessonTitle: z.string().optional(),
      expectedBehavior: z.string().optional(),
    })
    .optional(),
});

export type LearningEvalTurn = z.infer<typeof LearningEvalTurnSchema>;
export type LearningEvalCase = z.infer<typeof LearningEvalCaseSchema>;

export type ReviewerScores = {
  correctness: 0 | 1 | 2;
  levelFit: 0 | 1 | 2;
  actionableHint: 0 | 1 | 2;
  contextualRelevance: 0 | 1 | 2;
  learnerRetry: 0 | 1 | 2;
};

export type LearningEvalCheck = {
  id: string;
  passed: boolean;
  message?: string;
};

export type LearningEvalResult = {
  caseId: string;
  commitSha: string;
  environment: string;
  provider?: string;
  model?: string;
  promptVersion: string;
  datasetHash: string;
  latencyMs: number;
  usageKnown: boolean;
  costUnknown: boolean;
  checks: LearningEvalCheck[];
  failures: string[];
  reviewerScores?: ReviewerScores;
  reviewerId?: string;
  turnOutputs?: unknown[];
};

export function parseLearningDataset(rawContent: string): LearningEvalCase[] {
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    try {
      const parsed = JSON.parse(line);
      return LearningEvalCaseSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Invalid JSON or schema mismatch at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function computeDatasetHash(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

export function validateLearningDataset(cases: LearningEvalCase[]): {
  checks: LearningEvalCheck[];
  failures: string[];
} {
  const checks: LearningEvalCheck[] = [];
  const failures: string[] = [];

  const addCheck = (id: string, condition: boolean, message: string) => {
    checks.push({ id, passed: condition, message: condition ? undefined : message });
    if (!condition) failures.push(`[${id}] ${message}`);
  };

  addCheck(
    "case_count_ge_12",
    cases.length >= 12,
    `Dataset must contain at least 12 cases; found ${cases.length}`,
  );

  const missionCount = cases.filter((c) => c.mode === "MISSION").length;
  const coachCount = cases.filter((c) => c.mode === "LESSON_COACH").length;
  const questCount = cases.filter((c) => c.mode === "DAILY_QUEST").length;

  addCheck("mission_count_ge_4", missionCount >= 4, `Must have >= 4 MISSION cases, found ${missionCount}`);
  addCheck("coach_count_ge_4", coachCount >= 4, `Must have >= 4 LESSON_COACH cases, found ${coachCount}`);
  addCheck("quest_count_ge_4", questCount >= 4, `Must have >= 4 DAILY_QUEST cases, found ${questCount}`);

  const allHave3Turns = cases.every((c) => c.turns.length >= 3);
  addCheck("all_turns_ge_3", allHave3Turns, "Every case must have >= 3 turns");

  const allSynthetic = cases.every((c) => c.synthetic === true);
  addCheck("all_synthetic", allSynthetic, "Every case must have synthetic: true");

  const caseIds = new Set<string>();
  let uniqueIds = true;
  for (const c of cases) {
    if (caseIds.has(c.caseId)) {
      uniqueIds = false;
      break;
    }
    caseIds.add(c.caseId);
  }
  addCheck("unique_case_ids", uniqueIds, "All case IDs must be unique");

  return { checks, failures };
}
