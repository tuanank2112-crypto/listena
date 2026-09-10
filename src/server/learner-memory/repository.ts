import type { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const MAX_GOALS = 12;
const MAX_ERRORS = 24;
const MAX_SKILLS = 24;
const MAX_PREFERENCE_ENTRIES = 24;

export type LearnerMemoryRecord = {
  id: string;
  userId: string;
  goalsJson: string;
  errorsJson: string;
  skillsJson: string;
  preferencesJson: string;
};

export type LearnerMemoryGoal = {
  text: string;
  evidenceIds: string[];
  updatedAt: string;
};

export type LearnerMemoryError = {
  errorType: string;
  count: number;
  lastEvidenceId: string;
};

export type LearnerMemorySkill = {
  skillKey: string;
  masteryScore: number;
  evidenceCount: number;
  lastEvidenceId?: string;
};

type PreferenceValue = string | number | boolean | null | string[];
export type LearnerMemoryPreferences = Record<string, PreferenceValue>;

export type LearnerMemory = {
  id: string;
  userId: string;
  goals: LearnerMemoryGoal[];
  recurringErrors: LearnerMemoryError[];
  provenSkills: LearnerMemorySkill[];
  preferences: LearnerMemoryPreferences;
};

export type MemoryEvidence = {
  id: string;
  skillKey: string;
  score: number;
  errorType?: string | null;
};

type LearnerMemoryDb = Pick<Prisma.TransactionClient, "learnerMemory">;

function parseJson(raw: string, field: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    warnCorruptMemory(field);
    return undefined;
  }
}

function parseGoals(raw: string): LearnerMemoryGoal[] {
  const value = parseJson(raw, "goals");
  if (!Array.isArray(value)) {
    if (value !== undefined) warnCorruptMemory("goals");
    return [];
  }
  const goals = value.flatMap((item) => {
    if (!isObject(item) || typeof item.text !== "string" || !Array.isArray(item.evidenceIds) || !item.evidenceIds.every((id) => typeof id === "string") || typeof item.updatedAt !== "string") {
      warnCorruptMemory("goals");
      return [];
    }
    const text = cleanText(item.text, 240);
    const evidenceIds = item.evidenceIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => cleanText(id, 120))
      .filter(Boolean)
      .slice(0, 12);
    const updatedAt = cleanText(item.updatedAt, 40);
    if (!text || !updatedAt || !Number.isFinite(Date.parse(updatedAt))) {
      warnCorruptMemory("goals");
      return [];
    }
    return [{ text, evidenceIds, updatedAt }];
  });
  return goals.slice(0, MAX_GOALS);
}

function parseErrors(raw: string): LearnerMemoryError[] {
  const value = parseJson(raw, "errors");
  if (!Array.isArray(value)) {
    if (value !== undefined) warnCorruptMemory("errors");
    return [];
  }
  const errors = value.flatMap((item) => {
    if (!isObject(item) || typeof item.errorType !== "string" || !isCount(item.count) || typeof item.lastEvidenceId !== "string") {
      warnCorruptMemory("errors");
      return [];
    }
    const errorType = cleanText(item.errorType, 80);
    const lastEvidenceId = cleanText(item.lastEvidenceId, 120);
    if (!errorType || !lastEvidenceId) {
      warnCorruptMemory("errors");
      return [];
    }
    return [{ errorType, count: item.count, lastEvidenceId }];
  });
  return errors.slice(0, MAX_ERRORS);
}

function parseSkills(raw: string): LearnerMemorySkill[] {
  const value = parseJson(raw, "skills");
  if (!Array.isArray(value)) {
    if (value !== undefined) warnCorruptMemory("skills");
    return [];
  }
  const skills = value.flatMap((item) => {
    if (!isObject(item) || typeof item.skillKey !== "string" || !isScore(item.masteryScore) || !isCount(item.evidenceCount) || (item.lastEvidenceId !== undefined && typeof item.lastEvidenceId !== "string")) {
      warnCorruptMemory("skills");
      return [];
    }
    const skillKey = cleanText(item.skillKey, 80);
    if (!skillKey) {
      warnCorruptMemory("skills");
      return [];
    }
    const lastEvidenceId = typeof item.lastEvidenceId === "string"
      ? cleanText(item.lastEvidenceId, 120)
      : undefined;
    if (item.lastEvidenceId !== undefined && !lastEvidenceId) {
      warnCorruptMemory("skills");
      return [];
    }
    return [{ skillKey, masteryScore: item.masteryScore, evidenceCount: item.evidenceCount, ...(lastEvidenceId ? { lastEvidenceId } : {}) }];
  });
  return skills.slice(0, MAX_SKILLS);
}

function parsePreferences(raw: string): LearnerMemoryPreferences {
  const value = parseJson(raw, "preferences");
  if (!isObject(value)) {
    if (value !== undefined) warnCorruptMemory("preferences");
    return {};
  }
  const preferences: LearnerMemoryPreferences = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_PREFERENCE_ENTRIES)) {
    const cleanedKey = cleanText(key, 80);
    const cleanedValue = sanitizePreferenceValue(entry);
    if (!cleanedKey || cleanedValue === undefined) {
      warnCorruptMemory("preferences");
      continue;
    }
    preferences[cleanedKey] = cleanedValue;
  }
  return preferences;
}

function sanitizePreferenceValue(value: unknown): PreferenceValue | undefined {
  if (typeof value === "string") return cleanText(value, 240) || undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return undefined;
  return value.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 12);
}

export function parseLearnerMemory(record: LearnerMemoryRecord): LearnerMemory {
  return {
    id: record.id,
    userId: record.userId,
    goals: parseGoals(record.goalsJson),
    recurringErrors: parseErrors(record.errorsJson),
    provenSkills: parseSkills(record.skillsJson),
    preferences: parsePreferences(record.preferencesJson),
  };
}

export async function getLearnerMemory(userId: string): Promise<LearnerMemory | null> {
  const record = await prisma.learnerMemory.findUnique({ where: { userId } });
  return record ? parseLearnerMemory(record) : null;
}

/**
 * Persists the aggregate alongside the newly-created evidence. The caller must
 * pass the session transaction so failure rolls back all associated turn data.
 */
export async function appendEvidenceToMemory(
  tx: LearnerMemoryDb,
  userId: string,
  evidence: MemoryEvidence,
): Promise<LearnerMemory> {
  const existing = await tx.learnerMemory.findUnique({ where: { userId } });
  const write = planLearnerMemoryEvidenceWrite(
    userId,
    existing ? parseLearnerMemory(existing) : null,
    evidence,
  );
  const saved = await tx.learnerMemory.upsert({
    where: { userId },
    create: write.create,
    update: write.update,
  });
  return parseLearnerMemory(saved);
}

/**
 * Pure write plan shared with the Worker-native D1 batch path. Keeping this
 * transformation here prevents a D1 commit from drifting from the local
 * transactional learner-memory semantics.
 */
export function planLearnerMemoryEvidenceWrite(
  userId: string,
  existing: LearnerMemory | null,
  evidence: MemoryEvidence,
) {
  const normalizedEvidence = normalizeEvidence(evidence);
  const memory = existing ?? emptyMemory(userId);
  const provenSkills = updateSkill(memory.provenSkills, normalizedEvidence);
  const recurringErrors = updateErrors(memory.recurringErrors, normalizedEvidence);
  return {
    create: serializeNewMemory(
      userId,
      memory.goals,
      recurringErrors,
      provenSkills,
      memory.preferences,
    ),
    update: serializeEvidenceUpdate(recurringErrors, provenSkills),
  };
}

function updateSkill(skills: LearnerMemorySkill[], evidence: Required<Pick<MemoryEvidence, "id" | "skillKey" | "score">> & Pick<MemoryEvidence, "errorType">): LearnerMemorySkill[] {
  const existing = skills.find((item) => item.skillKey === evidence.skillKey);
  if (!existing) {
    return [...skills, { skillKey: evidence.skillKey, masteryScore: evidence.score, evidenceCount: 1, lastEvidenceId: evidence.id }].slice(-MAX_SKILLS);
  }
  return skills.map((item) => item.skillKey === evidence.skillKey
    ? { ...item, masteryScore: Math.max(item.masteryScore, evidence.score), evidenceCount: item.evidenceCount + 1, lastEvidenceId: evidence.id }
    : item);
}

function updateErrors(errors: LearnerMemoryError[], evidence: MemoryEvidence): LearnerMemoryError[] {
  if (!evidence.errorType) return errors;
  const existing = errors.find((item) => item.errorType === evidence.errorType);
  if (!existing) {
    return [...errors, { errorType: evidence.errorType, count: 1, lastEvidenceId: evidence.id }].slice(-MAX_ERRORS);
  }
  return errors.map((item) => item.errorType === evidence.errorType
    ? { ...item, count: item.count + 1, lastEvidenceId: evidence.id }
    : item);
}

function serializeNewMemory(
  userId: string,
  goals: LearnerMemoryGoal[],
  recurringErrors: LearnerMemoryError[],
  provenSkills: LearnerMemorySkill[],
  preferences: LearnerMemoryPreferences,
) {
  return {
    userId,
    goalsJson: JSON.stringify(goals),
    errorsJson: JSON.stringify(recurringErrors),
    skillsJson: JSON.stringify(provenSkills),
    preferencesJson: JSON.stringify(preferences),
  };
}

function serializeEvidenceUpdate(
  recurringErrors: LearnerMemoryError[],
  provenSkills: LearnerMemorySkill[],
) {
  return {
    errorsJson: JSON.stringify(recurringErrors),
    skillsJson: JSON.stringify(provenSkills),
  };
}

function normalizeEvidence(evidence: MemoryEvidence) {
  const id = cleanText(evidence.id, 120);
  const skillKey = cleanText(evidence.skillKey, 80);
  const errorType = evidence.errorType ? cleanText(evidence.errorType, 80) : null;
  if (!id || !skillKey || !isScore(evidence.score)) {
    throw new Error("Cannot append invalid learning evidence to learner memory");
  }
  return { id, skillKey, score: evidence.score, errorType: errorType || null };
}

function emptyMemory(userId: string): LearnerMemory {
  return { id: "", userId, goals: [], recurringErrors: [], provenSkills: [], preferences: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1_000_000;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function cleanText(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function warnCorruptMemory(field: string) {
  logger.warn({ memoryField: field }, "Ignoring structurally invalid learner memory");
}
