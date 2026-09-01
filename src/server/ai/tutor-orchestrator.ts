import type { LearningSessionModeSchema } from "@/server/validation/learning-session";
import {
  MissionStateSchema,
  TutorTurnOutputSchema,
  type MissionState,
  type TutorTurnOutput,
} from "@/server/validation/learning-session";
import type { z } from "zod";
import { planDailyQuest, type DailyQuestPlan } from "@/server/ai/daily-quest";
import {
  createLessonCoachTemplate,
  createMissionState,
  getMissionTemplate,
  LESSON_COACH_SCENARIO_KEY,
} from "@/server/ai/mission-templates";
import {
  buildGroundedTutorContext,
  type LearnerTutorContext,
  type LessonTutorContext,
  type RecentTutorTurn,
} from "@/server/ai/tutor-grounding";
import {
  buildEvaluateTurnProviderInput,
  buildStartMissionProviderInput,
  TUTOR_PROMPT_VERSION,
  TUTOR_SYSTEM_PROMPT,
} from "@/server/ai/tutor-prompts";
import type { TutorTurnProvider } from "@/server/ai/tutor-provider-contract";
import {
  createEvaluateTurnFallback,
  createStartMissionFallback,
} from "@/server/ai/tutor-fallback";

type LearningSessionMode = z.infer<typeof LearningSessionModeSchema>;

export interface StartMissionInput {
  mode?: LearningSessionMode;
  scenarioKey?: string;
  goal?: string;
  learnerKey?: string;
  dateKey?: string;
  learnerContext?: LearnerTutorContext;
  lessonContext?: LessonTutorContext;
  recentScenarioKeys?: string[];
}

export interface EvaluateTutorTurnInput {
  state: MissionState;
  learnerMessage: string;
  recentTurns?: RecentTutorTurn[];
  learnerContext?: LearnerTutorContext;
  lessonContext?: LessonTutorContext;
}

export interface TutorRuntimeOptions {
  provider?: TutorTurnProvider;
  now?: Date;
}

export interface TutorRuntimeMeta {
  provider: string;
  model?: string;
  promptVersion: string;
  fallbackReason?: string;
  groundedKnowledgeIds: string[];
}

export interface StartMissionResult {
  state: MissionState;
  opening: TutorTurnOutput;
  dailyQuest?: DailyQuestPlan;
  meta: TutorRuntimeMeta;
}

export interface TutorTurnResult {
  output: TutorTurnOutput;
  meta: TutorRuntimeMeta;
}

export async function startMission(
  input: StartMissionInput,
  options: TutorRuntimeOptions = {},
): Promise<StartMissionResult> {
  const now = options.now ?? new Date();
  const dailyQuest =
    input.mode === "DAILY_QUEST"
      ? planDailyQuest({
          learnerKey: input.learnerKey ?? "anonymous-learner",
          dateKey: input.dateKey ?? now.toISOString().slice(0, 10),
          skillMastery: input.learnerContext?.skillMastery,
          dueVocabulary: input.learnerContext?.dueVocabulary,
          preferredTopics: input.learnerContext?.preferredTopics,
          recentScenarioKeys: input.recentScenarioKeys,
        })
      : undefined;
  const template =
    input.mode === "LESSON_COACH"
      ? createLessonCoachTemplate(input.lessonContext)
      : getMissionTemplate(dailyQuest?.scenarioKey ?? input.scenarioKey);
  const state = MissionStateSchema.parse(
    createMissionState(template, {
      goal: input.goal ?? dailyQuest?.goal,
      targetVocabulary: dailyQuest?.targetVocabulary,
    }),
  );
  const groundedContext = buildGroundedTutorContext({
    template,
    learnerContext: input.learnerContext,
    lessonContext: input.lessonContext,
  });
  const fallback = createStartMissionFallback(template);
  const generated = await generateValidatedTurn({
    purpose: "start_mission",
    provider: options.provider,
    input: buildStartMissionProviderInput({
      state,
      openingLine: template.openingLine,
      firstPrompt: template.firstPrompt,
      groundedContext,
    }),
    fallback,
    groundedKnowledgeIds: groundedContext.verifiedKnowledge.map(
      (source) => source.id,
    ),
  });

  return { state, opening: generated.output, dailyQuest, meta: generated.meta };
}

export async function evaluateTutorTurn(
  input: EvaluateTutorTurnInput,
  options: TutorRuntimeOptions = {},
): Promise<TutorTurnResult> {
  const state = MissionStateSchema.parse(input.state);
  const learnerMessage = input.learnerMessage
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  const template =
    state.scenarioKey === LESSON_COACH_SCENARIO_KEY
      ? createLessonCoachTemplate(input.lessonContext)
      : getMissionTemplate(state.scenarioKey);
  const groundedContext = buildGroundedTutorContext({
    template,
    learnerMessage,
    learnerContext: input.learnerContext,
    lessonContext: input.lessonContext,
  });
  const fallback = createEvaluateTurnFallback({
    state,
    learnerMessage,
    template,
  });

  return generateValidatedTurn({
    purpose: "evaluate_turn",
    provider: options.provider,
    input: buildEvaluateTurnProviderInput({
      state,
      learnerMessage,
      recentTurns: input.recentTurns ?? [],
      groundedContext,
    }),
    fallback,
    groundedKnowledgeIds: groundedContext.verifiedKnowledge.map(
      (source) => source.id,
    ),
  });
}

async function generateValidatedTurn(input: {
  purpose: "start_mission" | "evaluate_turn";
  provider?: TutorTurnProvider;
  input: Record<string, unknown>;
  fallback: TutorTurnOutput;
  groundedKnowledgeIds: string[];
}): Promise<TutorTurnResult> {
  const provider = input.provider ?? (await createDefaultTutorProvider());
  if (!provider) {
    return fallbackResult(
      input.fallback,
      input.groundedKnowledgeIds,
      "provider_not_configured",
    );
  }
  try {
    const response = await provider.generate({
      purpose: input.purpose,
      systemPrompt: TUTOR_SYSTEM_PROMPT,
      input: input.input,
    });
    const parsed = TutorTurnOutputSchema.safeParse(response.output);
    if (!parsed.success) {
      return fallbackResult(
        input.fallback,
        input.groundedKnowledgeIds,
        "schema_validation_failed",
        response.provider,
        response.model,
      );
    }

    const policyOutput = enforceNoAnswerLeak(parsed.data);
    return {
      output: policyOutput,
      meta: {
        provider: response.provider,
        model: response.model,
        promptVersion: TUTOR_PROMPT_VERSION,
        groundedKnowledgeIds: input.groundedKnowledgeIds,
      },
    };
  } catch (error) {
    return fallbackResult(
      input.fallback,
      input.groundedKnowledgeIds,
      error instanceof Error
        ? `provider_error:${error.name}`
        : "provider_error",
      provider.providerName,
      provider.modelName,
    );
  }
}

function fallbackResult(
  output: TutorTurnOutput,
  groundedKnowledgeIds: string[],
  fallbackReason: string,
  provider = "deterministic-fallback",
  model?: string,
): TutorTurnResult {
  return {
    output: TutorTurnOutputSchema.parse(output),
    meta: {
      provider,
      model,
      promptVersion: TUTOR_PROMPT_VERSION,
      fallbackReason,
      groundedKnowledgeIds,
    },
  };
}

function enforceNoAnswerLeak(output: TutorTurnOutput): TutorTurnOutput {
  if (!output.intervention) return output;
  const answerCandidates =
    output.intervention.type === "CHOICE"
      ? [
          output.intervention.spec.options[
            output.intervention.validator.correctIndex
          ],
        ]
      : output.intervention.type === "REORDER"
        ? [output.intervention.validator.correctAnswer]
        : output.intervention.validator.acceptedAnswers;
  const visibleText = [
    output.npcReply,
    output.coachMessage,
    output.intervention.prompt,
  ]
    .join(" ")
    .toLowerCase();
  const leaked = answerCandidates.some((answer) => {
    const normalized = answer?.trim().toLowerCase();
    return (
      normalized && normalized.length >= 4 && visibleText.includes(normalized)
    );
  });
  return leaked
    ? { ...output, intervention: null, pedagogicalAct: "ASK_GUIDING" }
    : output;
}

async function createDefaultTutorProvider(): Promise<
  TutorTurnProvider | undefined
> {
  if (process.env.AI_PROVIDER !== "openai") return undefined;
  const { createConfiguredTutorProvider } =
    await import("@/server/ai/openai-tutor-provider");
  return createConfiguredTutorProvider();
}

export type {
  LearnerTutorContext,
  LessonTutorContext,
  RecentTutorTurn,
  TutorTurnProvider,
};
