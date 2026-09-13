import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  executeAtomicLibSqlBatch,
  libSqlTimestamp,
  type LibSqlBatchStatement,
} from "@/lib/libsql-batch";
import { prisma } from "@/lib/prisma";
import {
  parseLearnerMemory,
  type LearnerMemoryRecord,
  type LearnerMemoryPreferences,
} from "@/server/learner-memory/repository";

const DAILY_MINUTES = [5, 10, 15, 20] as const;
const RESERVED_INTENT_KEYS = ["selfStudyGoal", "dailyMinutes", "preferredTopics"] as const;
const MAX_PREFERENCES = 24;

export const LearnerIntentSchema = z.object({
  goal: z.string().trim().min(3).max(240).nullable(),
  dailyMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
  ]),
  preferredTopics: z.array(z.string().trim().min(1).max(40)).max(8),
  revision: z.string().trim().min(1).max(128).nullable(),
}).superRefine((input, context) => {
  const uniqueTopics = new Set(input.preferredTopics.map((topic) => topic.toLocaleLowerCase()));
  if (uniqueTopics.size !== input.preferredTopics.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["preferredTopics"],
      message: "Topics must be unique",
    });
  }
});

export type LearnerIntent = {
  goal: string | null;
  dailyMinutes: (typeof DAILY_MINUTES)[number];
  preferredTopics: string[];
  revision: string | null;
};

type LearnerIntentMemoryRecord = LearnerMemoryRecord & {
  createdAt?: Date;
  updatedAt?: Date;
};

type LearnerIntentProfile = {
  preferredTopics: string;
};

export class LearnerIntentError extends Error {
  constructor(
    message: string,
    readonly code: "INTENT_CONFLICT" | "INTENT_CAPACITY" | "INTENT_PROFILE_MISSING",
    readonly status = 409,
  ) {
    super(message);
    this.name = "LearnerIntentError";
  }
}

export function toLearnerIntent(
  memory: LearnerIntentMemoryRecord | null,
  profile: LearnerIntentProfile | null,
): LearnerIntent {
  const parsed = memory ? parseLearnerMemory(memory) : null;
  const preferences = parsed?.preferences ?? {};
  const goal = typeof preferences.selfStudyGoal === "string"
    ? preferences.selfStudyGoal
    : null;
  const dailyMinutes = isDailyMinutes(preferences.dailyMinutes)
    ? preferences.dailyMinutes
    : 10;
  const preferredTopics = Array.isArray(preferences.preferredTopics)
    ? uniqueTopics(preferences.preferredTopics)
    : legacyTopics(profile?.preferredTopics ?? "");

  return {
    goal,
    dailyMinutes,
    preferredTopics,
    revision: memory ? revisionFor(memory) : null,
  };
}

export async function getLearnerIntent(userId: string): Promise<LearnerIntent> {
  const [memory, profile] = await Promise.all([
    prisma.learnerMemory.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        goalsJson: true,
        errorsJson: true,
        skillsJson: true,
        preferencesJson: true,
      },
    }),
    prisma.learnerProfile.findUnique({
      where: { userId },
      select: { preferredTopics: true },
    }),
  ]);

  return toLearnerIntent(memory, profile);
}

export async function updateLearnerIntent(
  userId: string,
  input: z.infer<typeof LearnerIntentSchema>,
): Promise<LearnerIntent> {
  const [memory, profile] = await Promise.all([
    prisma.learnerMemory.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        goalsJson: true,
        errorsJson: true,
        skillsJson: true,
        preferencesJson: true,
      },
    }),
    prisma.learnerProfile.findUnique({
      where: { userId },
      select: { preferredTopics: true },
    }),
  ]);

  const current = toLearnerIntent(memory, profile);
  if (input.revision !== current.revision) {
    throw new LearnerIntentError("Learner intent changed; refresh and try again", "INTENT_CONFLICT");
  }
  if (!profile) {
    throw new LearnerIntentError("Learner profile is unavailable", "INTENT_PROFILE_MISSING", 404);
  }

  const preferences = updatedPreferences(memory, input);
  const nextPreferencesJson = JSON.stringify(preferences);
  const now = new Date();
  const statements = buildLearnerIntentStatements({
    userId,
    memory,
    nextPreferencesJson,
    preferredTopics: input.preferredTopics,
    now,
  });
  const result = await executeAtomicLibSqlBatch(statements);
  if (result[0]?.changes !== 1 || result[1]?.changes !== 1) {
    throw new LearnerIntentError("Learner intent changed; refresh and try again", "INTENT_CONFLICT");
  }

  const resultingMemory: LearnerIntentMemoryRecord = memory
    ? { ...memory, preferencesJson: nextPreferencesJson }
    : {
        id: statements[0]!.values![0] as string,
        userId,
        goalsJson: "[]",
        errorsJson: "[]",
        skillsJson: "[]",
        preferencesJson: nextPreferencesJson,
      };
  return toLearnerIntent(resultingMemory, { preferredTopics: input.preferredTopics.join(",") });
}

export function buildLearnerIntentStatements(input: {
  userId: string;
  memory: LearnerIntentMemoryRecord | null;
  nextPreferencesJson: string;
  preferredTopics: string[];
  now: Date;
}): LibSqlBatchStatement[] {
  const nowValue = libSqlTimestamp(input.now);
  const topicValue = input.preferredTopics.join(",");
  const memoryStatement = input.memory
    ? {
        sql: `UPDATE "LearnerMemory"
              SET "preferencesJson" = ?, "updatedAt" = ?
              WHERE "userId" = ? AND "id" = ?
                AND "goalsJson" = ? AND "errorsJson" = ?
                AND "skillsJson" = ? AND "preferencesJson" = ?`,
        values: [
          input.nextPreferencesJson,
          nowValue,
          input.userId,
          input.memory.id,
          input.memory.goalsJson,
          input.memory.errorsJson,
          input.memory.skillsJson,
          input.memory.preferencesJson,
        ],
      }
    : {
        sql: `INSERT INTO "LearnerMemory"
                ("id", "userId", "goalsJson", "errorsJson", "skillsJson", "preferencesJson", "createdAt", "updatedAt")
              SELECT ?, ?, '[]', '[]', '[]', ?, ?, ?
              WHERE NOT EXISTS (SELECT 1 FROM "LearnerMemory" WHERE "userId" = ?)`,
        values: [randomUUID(), input.userId, input.nextPreferencesJson, nowValue, nowValue, input.userId],
      };

  const expectedMemoryId = input.memory?.id ?? (memoryStatement.values![0] as string);
  return [
    memoryStatement,
    {
      sql: `UPDATE "LearnerProfile"
            SET "preferredTopics" = ?, "updatedAt" = ?
            WHERE "userId" = ?
              AND EXISTS (
                SELECT 1 FROM "LearnerMemory"
                WHERE "userId" = ? AND "id" = ? AND "preferencesJson" = ?
              )`,
      values: [topicValue, nowValue, input.userId, input.userId, expectedMemoryId, input.nextPreferencesJson],
    },
  ];
}

function updatedPreferences(
  memory: LearnerIntentMemoryRecord | null,
  input: z.infer<typeof LearnerIntentSchema>,
): LearnerMemoryPreferences {
  const existing = memory ? parseLearnerMemory(memory).preferences : {};
  const missingReservedKeys = RESERVED_INTENT_KEYS.filter((key) => !(key in existing));
  if (Object.keys(existing).length + missingReservedKeys.length > MAX_PREFERENCES) {
    throw new LearnerIntentError(
      "Learner preference capacity is full; refresh or reduce saved preferences",
      "INTENT_CAPACITY",
    );
  }

  return {
    ...existing,
    selfStudyGoal: input.goal,
    dailyMinutes: input.dailyMinutes,
    preferredTopics: uniqueTopics(input.preferredTopics),
  };
}

function revisionFor(memory: LearnerIntentMemoryRecord): string {
  return createHash("sha256")
    .update(memory.id)
    .update("\u0000")
    .update(memory.goalsJson)
    .update("\u0000")
    .update(memory.errorsJson)
    .update("\u0000")
    .update(memory.skillsJson)
    .update("\u0000")
    .update(memory.preferencesJson)
    .digest("base64url");
}

function isDailyMinutes(value: unknown): value is (typeof DAILY_MINUTES)[number] {
  return typeof value === "number" && DAILY_MINUTES.includes(value as (typeof DAILY_MINUTES)[number]);
}

function legacyTopics(value: string): string[] {
  return uniqueTopics(value.split(","));
}

function uniqueTopics(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const topic = value.replace(/\s+/g, " ").trim().slice(0, 40);
    const key = topic.toLocaleLowerCase();
    if (!topic || seen.has(key)) return [];
    seen.add(key);
    return [topic];
  }).slice(0, 8);
}
