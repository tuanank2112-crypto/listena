import "server-only";

import { prisma } from "@/lib/prisma";
import { aggregateRecurringErrors } from "@/core/learning/error-taxonomy";
import {
  CUSTOM_SCENARIO_PREFIX,
  customScenarioId,
  customScenarioKey,
  type MissionTemplate,
} from "@/server/ai/mission-templates";
import {
  GENERATED_SCENARIO_JSON_SCHEMA,
  GeneratedScenarioSchema,
  SCENARIO_AUTHOR_SYSTEM_PROMPT,
  buildScenarioAuthorInput,
  type GeneratedScenario,
} from "@/server/ai/scenario-author";
import { AIUnavailableError } from "@/server/ai/errors";
import { createConfiguredStructuredAIProvider } from "@/server/ai/openai-responses-provider";
import { reserveUserAICall, settleUserAICall } from "@/server/ai/request-budget";
import { getLearnerMemory } from "@/server/learner-memory/repository";

/**
 * Plan23 SPEC-P232 — mission scenarios a learner asked for.
 *
 * Ownership is enforced here and only here. Everywhere else a scenario key is
 * only *recognised* by shape, which is what lets the planner and the session
 * repository keep their synchronous guards.
 */

/** How many live scenarios one learner may keep. */
export const MAX_LEARNER_SCENARIOS = 12;
/** The turn budget the server grants a generated scenario. */
const SCENARIO_MAX_TURNS = 7;
const SCENARIO_MAX_OUTPUT_TOKENS = 700;

export interface LearnerScenarioView {
  id: string;
  key: string;
  title: string;
  npcName: string;
  npcRole: string;
  summaryVi: string;
  learnerGoal: string;
  targetVocabulary: string[];
  sourcePrompt: string;
  createdAt: string;
}

function parseList(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type ScenarioRow = {
  id: string;
  sourcePrompt: string;
  title: string;
  npcName: string;
  npcRole: string;
  learnerGoal: string;
  openingLine: string;
  firstPrompt: string;
  targetVocabularyJson: string;
  targetGrammarJson: string;
  maxTurns: number;
  createdAt: Date;
};

function toView(row: ScenarioRow): LearnerScenarioView {
  return {
    id: row.id,
    key: customScenarioKey(row.id),
    title: row.title,
    npcName: row.npcName,
    npcRole: row.npcRole,
    // The Vietnamese summary lives with the learner's own words, not in the
    // tutor prompt, so it is stored alongside the request that produced it.
    summaryVi: row.sourcePrompt,
    learnerGoal: row.learnerGoal,
    targetVocabulary: parseList(row.targetVocabularyJson),
    sourcePrompt: row.sourcePrompt,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLearnerMissionScenarios(userId: string): Promise<LearnerScenarioView[]> {
  const rows = await prisma.learnerMissionScenario.findMany({
    where: { userId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: MAX_LEARNER_SCENARIOS,
  });
  return rows.map(toView);
}

/**
 * Resolve a `custom-<id>` key to a template **for this learner**.
 *
 * Returns null for a key that is not custom, not theirs, or no longer there.
 * An archived scenario still resolves: a session already playing it must be
 * able to finish.
 */
export async function loadCustomMissionTemplate(
  userId: string,
  scenarioKey: string | undefined,
): Promise<MissionTemplate | null> {
  if (!scenarioKey) return null;
  const id = customScenarioId(scenarioKey);
  if (!id) return null;

  const row = await prisma.learnerMissionScenario.findFirst({ where: { id, userId } });
  if (!row) return null;

  return {
    key: customScenarioKey(row.id),
    title: row.title,
    npcName: row.npcName,
    npcRole: row.npcRole,
    learnerGoal: row.learnerGoal,
    openingLine: row.openingLine,
    firstPrompt: row.firstPrompt,
    targetVocabulary: parseList(row.targetVocabularyJson),
    targetGrammar: parseList(row.targetGrammarJson),
    maxTurns: row.maxTurns,
    recommendedUnit: 1,
  };
}

export class ScenarioLimitError extends Error {
  readonly code = "SCENARIO_LIMIT";
  constructor() {
    super(`Bạn đang có tối đa ${MAX_LEARNER_SCENARIOS} chủ đề. Hãy xoá bớt một chủ đề cũ.`);
    this.name = "ScenarioLimitError";
  }
}

/** What the learner already told the product, used to ground the situation. */
async function loadAuthoringContext(userId: string) {
  const [profile, memory, weakWords] = await Promise.all([
    prisma.learnerProfile.findUnique({
      where: { userId },
      select: { estimatedCefrLevel: true, preferredTopics: true },
    }),
    getLearnerMemory(userId),
    prisma.vocabularyMastery.findMany({
      where: { userId, incorrectCount: { gt: 0 } },
      orderBy: { incorrectCount: "desc" },
      take: 8,
      select: { vocabularyItem: { select: { displayText: true } } },
    }),
  ]);

  return {
    cefrLevel: profile?.estimatedCefrLevel ?? "A2",
    preferredTopics: (profile?.preferredTopics ?? "")
      .split(",")
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0),
    recurringMistakes: aggregateRecurringErrors(memory?.recurringErrors ?? [])
      .slice(0, 3)
      .map((error) => error.labelVi),
    weakWords: weakWords.map((row) => row.vocabularyItem.displayText),
  };
}

/**
 * Write a scenario for this learner and keep it.
 *
 * The AI call is metered through the same per-user reservation every other AI
 * feature uses, so a learner cannot mint situations without limit, and the
 * output is validated before a single field of it reaches a tutor prompt.
 */
export async function createLearnerMissionScenario(input: {
  userId: string;
  prompt: string;
}): Promise<LearnerScenarioView> {
  const live = await prisma.learnerMissionScenario.count({
    where: { userId: input.userId, archivedAt: null },
  });
  if (live >= MAX_LEARNER_SCENARIOS) throw new ScenarioLimitError();

  const provider = createConfiguredStructuredAIProvider();
  if (!provider) throw new AIUnavailableError({ reason: "provider_not_configured" });

  const context = await loadAuthoringContext(input.userId);
  const reservation = await reserveUserAICall({
    userId: input.userId,
    purpose: "mission_scenario",
    requestIdentity: input.prompt.trim().slice(0, 240),
    provider: provider.providerName,
    model: provider.modelName,
  });

  let generated: GeneratedScenario;
  try {
    const response = await provider.generateJson<unknown>({
      purpose: "mission_scenario",
      systemPrompt: SCENARIO_AUTHOR_SYSTEM_PROMPT,
      input: buildScenarioAuthorInput({ prompt: input.prompt, ...context }),
      schemaName: "mission_scenario",
      schema: GENERATED_SCENARIO_JSON_SCHEMA,
      safetyIdentifier: input.userId,
      maxOutputTokens: SCENARIO_MAX_OUTPUT_TOKENS,
    });
    generated = GeneratedScenarioSchema.parse(response.output);
    await settleUserAICall(reservation, {
      success: true,
      provider: provider.providerName,
      model: provider.modelName,
    });
  } catch (error) {
    await settleUserAICall(reservation, {
      success: false,
      provider: provider.providerName,
      model: provider.modelName,
    });
    throw error;
  }

  const row = await prisma.learnerMissionScenario.create({
    data: {
      userId: input.userId,
      // Stored as the learner will read it back, not as they typed it: the
      // model's own one-line Vietnamese summary describes the situation better
      // than the request that asked for it.
      sourcePrompt: generated.summaryVi,
      title: generated.title,
      npcName: generated.npcName,
      npcRole: generated.npcRole,
      learnerGoal: generated.learnerGoal,
      openingLine: generated.openingLine,
      firstPrompt: generated.firstPrompt,
      targetVocabularyJson: JSON.stringify(generated.targetVocabulary),
      targetGrammarJson: JSON.stringify(generated.targetGrammar),
      maxTurns: SCENARIO_MAX_TURNS,
    },
  });

  return toView(row);
}

/**
 * Archive a scenario. Soft delete on purpose: a finished session still names
 * the scenario it was played with, and that name must keep resolving.
 */
export async function archiveLearnerMissionScenario(userId: string, id: string): Promise<boolean> {
  const result = await prisma.learnerMissionScenario.updateMany({
    where: { id, userId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export { CUSTOM_SCENARIO_PREFIX };
