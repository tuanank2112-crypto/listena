import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const PilotTaskRecordSchema = z.object({
  taskName: z.string().min(1),
  completedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  taskCompletionScore: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  comprehensibilityScore: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  targetErrorsObserved: z.number().int().min(0),
  durationMinutes: z.number().min(0),
});

export const PilotParticipantRecordSchema = z.object({
  participantId: z.string().min(1),
  enrolledAt: z.string(),
  status: z.enum(["ENROLLED", "COMPLETED", "WITHDRAWN"]),
  cefrInitial: z.enum(["A1", "A2", "B1"]).default("A2"),
  formativeSessionsCompleted: z.number().int().min(0),
  baselineTask: PilotTaskRecordSchema.optional(),
  transferTask: PilotTaskRecordSchema.optional(),
  delayedRetentionTask: PilotTaskRecordSchema.optional(),
  notes: z.string().optional(),
});

export const PilotCohortSchema = z.object({
  cohortId: z.string().min(1),
  createdAt: z.string(),
  protocolVersion: z.literal("pilot-v1"),
  participants: z.array(PilotParticipantRecordSchema).min(1),
});

export type PilotTaskRecord = z.infer<typeof PilotTaskRecordSchema>;
export type PilotParticipantRecord = z.infer<typeof PilotParticipantRecordSchema>;
export type PilotCohort = z.infer<typeof PilotCohortSchema>;

export function generateEmptyCohortTemplate(): PilotCohort {
  return {
    cohortId: `cohort-${new Date().toISOString().slice(0, 10)}`,
    createdAt: new Date().toISOString(),
    protocolVersion: "pilot-v1",
    participants: Array.from({ length: 6 }, (_, index) => {
      const id = String(index + 1).padStart(2, "0");
      return {
        participantId: `learner-p${id}`,
        enrolledAt: new Date().toISOString().slice(0, 10),
        status: "ENROLLED" as const,
        cefrInitial: "A2" as const,
        formativeSessionsCompleted: 0,
        notes: "Consented adult learner",
      };
    }),
  };
}

export function analyzeCohort(cohort: PilotCohort) {
  const total = cohort.participants.length;
  const completed = cohort.participants.filter((p) => p.status === "COMPLETED").length;
  const withdrawn = cohort.participants.filter((p) => p.status === "WITHDRAWN").length;
  const enrolled = cohort.participants.filter((p) => p.status === "ENROLLED").length;

  const paired = cohort.participants.filter(
    (p) => p.status === "COMPLETED" && p.baselineTask && p.transferTask,
  );

  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  const baselineCompletion = mean(paired.map((p) => p.baselineTask!.taskCompletionScore));
  const transferCompletion = mean(paired.map((p) => p.transferTask!.taskCompletionScore));
  const delayedCompletion = mean(
    paired.filter((p) => p.delayedRetentionTask).map((p) => p.delayedRetentionTask!.taskCompletionScore),
  );

  const baselineErrors = mean(paired.map((p) => p.baselineTask!.targetErrorsObserved));
  const transferErrors = mean(paired.map((p) => p.transferTask!.targetErrorsObserved));
  const delayedErrors = mean(
    paired.filter((p) => p.delayedRetentionTask).map((p) => p.delayedRetentionTask!.targetErrorsObserved),
  );

  return {
    cohortId: cohort.cohortId,
    total,
    completed,
    withdrawn,
    enrolled,
    attritionRate: total > 0 ? (withdrawn / total) * 100 : 0,
    pairedCount: paired.length,
    scores: {
      completion: {
        baseline: Number(baselineCompletion.toFixed(2)),
        transfer: Number(transferCompletion.toFixed(2)),
        delayed: Number(delayedCompletion.toFixed(2)),
      },
      errors: {
        baseline: Number(baselineErrors.toFixed(2)),
        transfer: Number(transferErrors.toFixed(2)),
        delayed: Number(delayedErrors.toFixed(2)),
      },
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--init-template")) {
    const outIdx = args.indexOf("--init-template") + 1;
    const targetFile = args[outIdx] || "eval/pilot-cohort-template.json";
    const template = generateEmptyCohortTemplate();
    writeFileSync(targetFile, JSON.stringify(template, null, 2), "utf-8");
    console.log(`Generated pilot cohort template at: ${targetFile}`);
    return;
  }

  const fileArg = args.find((a) => !a.startsWith("--")) || "eval/pilot-cohort-template.json";
  if (!existsSync(fileArg)) {
    console.log(`Usage: tsx scripts/pilot-cohort-tool.ts [--init-template <path>] [<cohort-file.json>]`);
    return;
  }

  const raw = readFileSync(fileArg, "utf-8");
  const parsed = PilotCohortSchema.parse(JSON.parse(raw));
  const summary = analyzeCohort(parsed);

  console.log("==========================================");
  console.log(" ListenAI Pilot Cohort Analysis");
  console.log("==========================================");
  console.log(`Cohort ID: ${summary.cohortId}`);
  console.log(`Enrolled: ${summary.enrolled}, Completed: ${summary.completed}, Withdrawn: ${summary.withdrawn}`);
  console.log(`Attrition Rate: ${summary.attritionRate.toFixed(1)}%`);
  console.log(`Paired Evaluations: ${summary.pairedCount}`);
  if (summary.pairedCount > 0) {
    console.log(`Mean Task Completion: Baseline=${summary.scores.completion.baseline} -> Transfer=${summary.scores.completion.transfer} -> Delayed=${summary.scores.completion.delayed}`);
    console.log(`Mean Target Errors: Baseline=${summary.scores.errors.baseline} -> Transfer=${summary.scores.errors.transfer} -> Delayed=${summary.scores.errors.delayed}`);
  }
}

if (process.argv[1]?.includes("pilot-cohort-tool")) {
  main();
}
