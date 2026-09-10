import "server-only";

import {
  createConfiguredOpenAIResponsesProvider,
  OpenAIResponsesProvider,
  type JsonSchema,
} from "@/server/ai/openai-responses-provider";
import type {
  TutorProviderRequest,
  TutorProviderResponse,
  TutorTurnProvider,
} from "@/server/ai/tutor-provider-contract";

interface OpenAICompatibleTutorProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Creates a live provider only when production has explicitly opted into it.
 * Callers turn an absent provider into a typed AI_UNAVAILABLE error; they must
 * never substitute deterministic copy for a learner-facing response.
 */
export function createConfiguredTutorProvider() {
  const provider = createConfiguredOpenAIResponsesProvider();
  return provider ? new OpenAICompatibleTutorProvider(provider) : undefined;
}

export class OpenAICompatibleTutorProvider implements TutorTurnProvider {
  readonly providerName = "openai";
  readonly modelName: string;
  private readonly provider: OpenAIResponsesProvider;

  constructor(
    config: OpenAICompatibleTutorProviderConfig | OpenAIResponsesProvider,
  ) {
    this.provider =
      config instanceof OpenAIResponsesProvider
        ? config
        : new OpenAIResponsesProvider(config);
    this.modelName = this.provider.modelName;
  }

  async generate(
    request: TutorProviderRequest,
  ): Promise<TutorProviderResponse> {
    return this.provider.generateJson({
      purpose: request.purpose,
      systemPrompt: request.systemPrompt,
      input: request.input,
      schemaName: "tutor_turn",
      schema: TutorTurnOutputJsonSchema,
      safetyIdentifier: request.safetyIdentifier,
      maxOutputTokens: 1_200,
    });
  }
}

/**
 * This is deliberately stricter than the Zod boundary. Structured Outputs
 * requires an exact object shape; Zod remains the final semantic validator
 * (including the CHOICE index refinement) in the orchestrator.
 */
export const TutorTurnOutputJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "npcReply",
    "coachMessage",
    "pedagogicalAct",
    "targetSkill",
    "score",
    "confidence",
    "detectedError",
    "statePatch",
    "intervention",
    "shouldComplete",
  ],
  properties: {
    npcReply: { type: "string" },
    coachMessage: { type: "string" },
    pedagogicalAct: {
      type: "string",
      enum: [
        "ASK_GUIDING",
        "CLARIFY",
        "RECAST",
        "RELISTEN",
        "INTERVENTION",
        "CONFIRM",
        "REFLECT",
      ],
    },
    targetSkill: {
      type: "string",
      enum: ["listening", "vocabulary", "spelling", "grammar", "communication"],
    },
    score: { type: "number" },
    confidence: { type: "number" },
    detectedError: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "expected", "actual", "explanationVi"],
          properties: {
            type: { type: "string" },
            expected: { type: "string" },
            actual: { type: "string" },
            explanationVi: { type: "string" },
          },
        },
      ],
    },
    statePatch: {
      type: "object",
      additionalProperties: false,
      required: [
        "phase",
        "trustDelta",
        "evidenceDelta",
        "successfulTurn",
        "recovered",
      ],
      properties: {
        phase: {
          type: "string",
          enum: [
            "BRIEFING",
            "ENCOUNTER",
            "CONSEQUENCE",
            "COMEBACK",
            "BOSS",
            "DEBRIEF",
          ],
        },
        trustDelta: { type: "integer" },
        evidenceDelta: { type: "integer" },
        successfulTurn: { type: "boolean" },
        recovered: { type: "boolean" },
      },
    },
    intervention: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "prompt", "spec", "validator"],
          properties: {
            type: { type: "string", enum: ["CHOICE"] },
            prompt: { type: "string" },
            spec: {
              type: "object",
              additionalProperties: false,
              required: ["options"],
              properties: {
                options: { type: "array", items: { type: "string" } },
              },
            },
            validator: {
              type: "object",
              additionalProperties: false,
              required: ["correctIndex"],
              properties: { correctIndex: { type: "integer" } },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "prompt", "spec", "validator"],
          properties: {
            type: { type: "string", enum: ["REORDER"] },
            prompt: { type: "string" },
            spec: {
              type: "object",
              additionalProperties: false,
              required: ["tokens"],
              properties: {
                tokens: { type: "array", items: { type: "string" } },
              },
            },
            validator: {
              type: "object",
              additionalProperties: false,
              required: ["correctAnswer"],
              properties: {
                correctAnswer: { type: "string" },
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "prompt", "spec", "validator"],
          properties: {
            type: {
              type: "string",
              enum: ["RETRY", "USE_IN_SENTENCE", "FILL_BLANK"],
            },
            prompt: { type: "string" },
            spec: {
              type: "object",
              additionalProperties: false,
              required: ["placeholder", "audioText"],
              properties: {
                placeholder: { type: "string" },
                audioText: { type: "string" },
              },
            },
            validator: {
              type: "object",
              additionalProperties: false,
              required: ["acceptedAnswers"],
              properties: {
                acceptedAnswers: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      ],
    },
    shouldComplete: { type: "boolean" },
  },
};
