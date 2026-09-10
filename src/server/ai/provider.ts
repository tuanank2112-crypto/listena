/**
 * Structured live-AI provider for legacy lesson generation and feedback flows.
 *
 * There is intentionally no environment-selected mock implementation here.
 * Unit tests inject `DeterministicMockTutorProvider` at the tutor boundary;
 * user-facing calls without a configured live provider fail honestly.
 */

import { z } from "zod";
import logger from "@/lib/logger";
import { AIUnavailableError } from "@/server/ai/errors";
import {
  OpenAIResponsesProvider,
  type JsonSchema,
} from "@/server/ai/openai-responses-provider";
import type { AIFeedbackResponse, AILessonDraft } from "../validation/schemas";
import {
  AIFeedbackResponseSchema,
  AILessonDraftSchema,
} from "../validation/schemas";

export interface AIProviderConfig {
  provider?: "openai";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

type AIProviderEnvironment = {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

export type AIFeedbackErrorType =
  AIFeedbackResponse["errors"][number]["errorType"];

export interface AIErrorAnalysisParams {
  transcript: string;
  submittedAnswer: string;
  wordDiffs: Array<{
    type: string;
    expected: string | null;
    actual: string | null;
  }>;
  cefrLevel: string;
  errorTypes: string[];
  /** Raw stable server-side learner ID; never included in the model prompt. */
  safetyIdentifier?: string;
}

export interface AILessonGenerationParams {
  topic: string;
  cefrLevel: string;
  learningObjectives: string[];
  targetVocabulary?: string[];
  targetGrammar?: string[];
  audioDuration?: number;
  accent?: string;
  difficulty?: number;
  /** Raw stable server-side user ID; never included in the model prompt. */
  safetyIdentifier?: string;
}

export interface AIProvider {
  readonly providerName: "openai";
  readonly modelName: string;
  analyzeErrors(params: AIErrorAnalysisParams): Promise<AIFeedbackResponse>;
  generateLesson(params: AILessonGenerationParams): Promise<AILessonDraft>;
  generateTutoringFeedback(
    transcript: string,
    answer: string,
    score: number,
    safetyIdentifier?: string,
  ): Promise<{ tip: string }>;
}

const TutoringFeedbackSchema = z.object({
  tip: z.string().trim().min(1).max(500),
});

export class OpenAIProvider implements AIProvider {
  readonly providerName = "openai" as const;
  readonly modelName: string;
  private readonly provider: OpenAIResponsesProvider;

  constructor(config: { apiKey: string; model?: string; baseUrl?: string }) {
    this.provider = new OpenAIResponsesProvider(config);
    this.modelName = this.provider.modelName;
  }

  async analyzeErrors(
    params: AIErrorAnalysisParams,
  ): Promise<AIFeedbackResponse> {
    const { safetyIdentifier, ...input } = params;
    return this.callAI(
      "error_analysis",
      [
        "You are an English listening tutor for Vietnamese learners.",
        "Analyze dictation errors and return concise, actionable Vietnamese feedback.",
        "Distinguish spelling from listening errors and never invent pronunciation rules.",
      ].join(" "),
      input,
      "error_analysis",
      AIFeedbackJsonSchema,
      AIFeedbackResponseSchema,
      safetyIdentifier,
      1_200,
    );
  }

  async generateLesson(
    params: AILessonGenerationParams,
  ): Promise<AILessonDraft> {
    const { safetyIdentifier, ...input } = params;
    return this.callAI(
      "lesson_generation",
      [
        "You are an English lesson content creator for Vietnamese learners.",
        "Create a safe, level-appropriate listening lesson that follows the supplied goals.",
        "Keep all generated English and Vietnamese fields internally consistent.",
      ].join(" "),
      input,
      "lesson_draft",
      AILessonDraftJsonSchema,
      AILessonDraftSchema,
      safetyIdentifier,
      2_000,
    );
  }

  async generateTutoringFeedback(
    transcript: string,
    answer: string,
    score: number,
    safetyIdentifier?: string,
  ) {
    return this.callAI(
      "tutoring_feedback",
      "Give one concise, supportive English-learning tip for a Vietnamese learner.",
      { transcript, answer, score },
      "tutoring_feedback",
      TutoringFeedbackJsonSchema,
      TutoringFeedbackSchema,
      safetyIdentifier,
      400,
    );
  }

  private async callAI<T>(
    purpose: string,
    systemPrompt: string,
    input: Record<string, unknown>,
    schemaName: string,
    jsonSchema: JsonSchema,
    schema: z.ZodType<T>,
    safetyIdentifier: string | undefined,
    maxOutputTokens: number,
  ): Promise<T> {
    const response = await this.provider.generateJson<unknown>({
      purpose,
      systemPrompt,
      input,
      schemaName,
      schema: jsonSchema,
      safetyIdentifier,
      maxOutputTokens,
    });
    const parsed = schema.safeParse(response.output);
    if (!parsed.success) {
      logger.warn(
        {
          provider: response.provider,
          model: response.model,
          requestId: response.requestId,
        },
        "OpenAI Responses output did not satisfy server validation",
      );
      throw new AIUnavailableError({
        reason: "schema_validation_failed",
        provider: response.provider,
        model: response.model,
        requestId: response.requestId,
      });
    }
    return parsed.data;
  }
}

export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.provider !== "openai" || !config.apiKey) {
    throw new AIUnavailableError({ reason: "provider_not_configured" });
  }
  return new OpenAIProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
  });
}

export function createAIProviderFromEnv(
  env: AIProviderEnvironment = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  },
): AIProvider {
  return createAIProvider({
    provider: env.AI_PROVIDER === "openai" ? "openai" : undefined,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
  });
}

const AIFeedbackJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summaryVi", "errors", "recommendedActions"],
  properties: {
    summaryVi: { type: "string" },
    errors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "errorType",
          "expected",
          "actual",
          "probableCauseVi",
          "explanationVi",
          "microExercise",
          "confidence",
        ],
        properties: {
          errorType: {
            type: "string",
            enum: [
              "PHONOLOGICAL",
              "SEGMENTATION",
              "GRAMMAR",
              "VOCABULARY",
              "SPELLING",
              "UNKNOWN",
            ],
          },
          expected: { type: "string" },
          actual: { anyOf: [{ type: "string" }, { type: "null" }] },
          probableCauseVi: { type: "string" },
          explanationVi: { type: "string" },
          microExercise: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "instructionVi", "items"],
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "RELISTEN",
                      "MINIMAL_PAIR",
                      "FILL_BLANK",
                      "REPEAT",
                      "FLASHCARD",
                    ],
                  },
                  instructionVi: { type: "string" },
                  items: { type: "array", items: { type: "string" } },
                },
              },
            ],
          },
          confidence: { type: "number" },
        },
      },
    },
    recommendedActions: { type: "array", items: { type: "string" } },
  },
};

const AILessonDraftJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "transcript", "segments", "vocabulary", "exercises"],
  properties: {
    title: { type: "string" },
    transcript: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["position", "text", "difficulty"],
        properties: {
          position: { type: "integer" },
          text: { type: "string" },
          difficulty: { type: "number" },
        },
      },
    },
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "lemma",
          "displayText",
          "ipa",
          "meaningVi",
          "meaningEn",
          "partOfSpeech",
          "cefrLevel",
          "exampleSentence",
        ],
        properties: {
          lemma: { type: "string" },
          displayText: { type: "string" },
          ipa: { type: "string" },
          meaningVi: { type: "string" },
          meaningEn: { type: "string" },
          partOfSpeech: { type: "string" },
          cefrLevel: {
            type: "string",
            enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
          },
          exampleSentence: { type: "string" },
        },
      },
    },
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "correctAnswer", "difficulty", "position"],
        properties: {
          type: {
            type: "string",
            enum: ["GIST", "PARTIAL_DICTATION", "FULL_DICTATION", "VOCABULARY"],
          },
          prompt: { type: "string" },
          correctAnswer: { type: "string" },
          difficulty: { type: "number" },
          position: { type: "integer" },
        },
      },
    },
  },
};

const TutoringFeedbackJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tip"],
  properties: { tip: { type: "string" } },
};
