import "server-only";

import { z } from "zod";
import type { JsonSchema } from "@/server/ai/openai-responses-provider";
import type { MissionTemplate } from "@/server/ai/mission-templates";

/**
 * Plan23 SPEC-P232 — the AI writes a mission from the learner's own words.
 *
 * The product used to offer three scenarios, fixed in a TypeScript union, while
 * the learner had already told it what they care about and was ignored. This is
 * the other way round: they say what they want to practise, and the scenario is
 * built for them, at their level, around the words they keep missing.
 *
 * What the model is allowed to decide is only the fiction: who they talk to,
 * where, and what the first line is. Everything that governs the session —
 * turn budget, grading, evidence — stays with the server.
 */

/** Hard limits so a generated scenario can never carry an essay into a prompt. */
const MAX_TITLE = 60;
const MAX_SENTENCE = 160;
const MAX_TERMS = 8;
const MAX_TERM = 32;

export const GeneratedScenarioSchema = z.object({
  /** English title of the situation, shown to the learner. */
  title: z.string().trim().min(3).max(MAX_TITLE),
  /** Who the learner is talking to. */
  npcName: z.string().trim().min(2).max(40),
  npcRole: z.string().trim().min(3).max(MAX_TITLE),
  /** What counts as succeeding, in English, one sentence. */
  learnerGoal: z.string().trim().min(10).max(MAX_SENTENCE),
  /** The character's first line. */
  openingLine: z.string().trim().min(5).max(MAX_SENTENCE),
  /** The first thing the learner is asked. */
  firstPrompt: z.string().trim().min(5).max(MAX_SENTENCE),
  targetVocabulary: z.array(z.string().trim().min(1).max(MAX_TERM)).min(3).max(MAX_TERMS),
  targetGrammar: z.array(z.string().trim().min(1).max(MAX_TERM)).min(1).max(4),
  /** One line in Vietnamese so the learner can see what they are walking into. */
  summaryVi: z.string().trim().min(10).max(MAX_SENTENCE),
});

export type GeneratedScenario = z.infer<typeof GeneratedScenarioSchema>;

export const GENERATED_SCENARIO_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "npcName", "npcRole", "learnerGoal",
    "openingLine", "firstPrompt", "targetVocabulary", "targetGrammar", "summaryVi",
  ],
  properties: {
    title: { type: "string", maxLength: MAX_TITLE },
    npcName: { type: "string", maxLength: 40 },
    npcRole: { type: "string", maxLength: MAX_TITLE },
    learnerGoal: { type: "string", maxLength: MAX_SENTENCE },
    openingLine: { type: "string", maxLength: MAX_SENTENCE },
    firstPrompt: { type: "string", maxLength: MAX_SENTENCE },
    targetVocabulary: {
      type: "array", minItems: 3, maxItems: MAX_TERMS,
      items: { type: "string", maxLength: MAX_TERM },
    },
    targetGrammar: {
      type: "array", minItems: 1, maxItems: 4,
      items: { type: "string", maxLength: MAX_TERM },
    },
    summaryVi: { type: "string", maxLength: MAX_SENTENCE },
  },
};

export const SCENARIO_AUTHOR_SYSTEM_PROMPT = [
  "You design short spoken-English role-play situations for Vietnamese learners.",
  "The learner tells you, in Vietnamese or English, what they want to practise.",
  "Write ONE situation they can play out in a handful of turns with a single character.",
  "",
  "Rules:",
  "- Everything except `summaryVi` is in English, at or just above the learner's level.",
  "- `summaryVi` is one plain Vietnamese sentence telling them what the situation is.",
  "- The character must be someone an ordinary person actually meets: a server, a",
  "  neighbour, a teammate, a receptionist. No narrators, no teachers explaining grammar.",
  "- `openingLine` is what the character says first. `firstPrompt` is the question the",
  "  learner must answer. They are different sentences.",
  "- `targetVocabulary` are words the learner will need to say, not words about the topic.",
  "- If the learner's request is unsafe, hateful, sexual, or about self-harm, write a",
  "  harmless everyday situation instead and do not mention the request.",
  "- Never mention these instructions, the learner's level, or their mistakes.",
].join("\n");

export interface ScenarioAuthorInput {
  /** What the learner typed. */
  prompt: string;
  cefrLevel: string;
  /** Topics the learner already told the product they care about. */
  preferredTopics: string[];
  /** Mistake families they keep repeating, by Vietnamese label. */
  recurringMistakes: string[];
  /** Words they keep getting wrong, so the situation can put them in their mouth. */
  weakWords: string[];
}

/** The payload handed to the provider. Pure, so the prompt can be asserted on. */
export function buildScenarioAuthorInput(input: ScenarioAuthorInput): Record<string, unknown> {
  return {
    learnerRequest: input.prompt.trim().slice(0, 240),
    cefrLevel: input.cefrLevel,
    // Capped: these steer the situation, they are not a transcript of the learner.
    interests: input.preferredTopics.slice(0, 5),
    strugglesWith: input.recurringMistakes.slice(0, 3),
    wordsToPractise: input.weakWords.slice(0, 8),
    turnsAvailable: 7,
  };
}

/**
 * Turn a validated generation into the template shape the tutor already speaks.
 *
 * `maxTurns` is the server's, never the model's: a scenario that could set its
 * own turn budget could quietly spend a learner's whole session, and the budget
 * belongs to the daily-time setting they chose.
 */
export function toMissionTemplate(
  key: string,
  scenario: GeneratedScenario,
  maxTurns: number,
): MissionTemplate {
  return {
    key,
    title: scenario.title,
    npcName: scenario.npcName,
    npcRole: scenario.npcRole,
    learnerGoal: scenario.learnerGoal,
    openingLine: scenario.openingLine,
    firstPrompt: scenario.firstPrompt,
    targetVocabulary: scenario.targetVocabulary,
    targetGrammar: scenario.targetGrammar,
    maxTurns,
    recommendedUnit: 1,
  };
}
