import { createHash } from "node:crypto";
import logger from "@/lib/logger";
import { AIRateLimitedError, AIUnavailableError } from "@/server/ai/errors";

export type JsonSchema = Record<string, unknown>;

export interface StructuredAIRequest {
  purpose: string;
  systemPrompt: string;
  input: Record<string, unknown>;
  schemaName: string;
  schema: JsonSchema;
  safetyIdentifier?: string;
  maxOutputTokens: number;
}

export interface StructuredAIResponse<T> {
  output: T;
  provider: "openai";
  model: string;
  requestId?: string;
}

/** Shared, fail-closed boundary for all server-side OpenAI Responses calls. */
export interface StructuredAIProvider {
  readonly providerName: "openai";
  readonly modelName: string;
  generateJson<T>(
    request: StructuredAIRequest,
  ): Promise<StructuredAIResponse<T>>;
}

export interface OpenAIResponsesProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

type OpenAIProviderEnvironment = {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

type ResponsesPayload = {
  id?: unknown;
  status?: unknown;
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown }>;
  }>;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 4_000;

export class OpenAIResponsesProvider implements StructuredAIProvider {
  readonly providerName = "openai" as const;
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAIResponsesProviderConfig) {
    this.apiKey = config.apiKey;
    this.modelName = config.model?.trim() || DEFAULT_MODEL;
    this.baseUrl = resolveOpenAIBaseUrl(config.baseUrl);
    this.timeoutMs = Math.min(Math.max(config.timeoutMs ?? 20_000, 1), 20_000);
  }

  async generateJson<T>(
    request: StructuredAIRequest,
  ): Promise<StructuredAIResponse<T>> {
    const startedAt = Date.now();
    const serializedInput = serializeInput(request.input);
    if (serializedInput === undefined) {
      const inputHash = hashValue("unserializable-input");
      logProviderFailure({
        provider: this.providerName,
        model: this.modelName,
        status: "invalid_input",
        latencyMs: Date.now() - startedAt,
        inputHash,
      });
      throw new AIUnavailableError({
        reason: "invalid_input",
        provider: this.providerName,
        model: this.modelName,
      });
    }
    const inputHash = hashValue(serializedInput);
    const maxOutputTokens = boundMaxOutputTokens(request.maxOutputTokens);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            instructions: request.systemPrompt,
            input: serializedInput,
            text: {
              format: {
                type: "json_schema",
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
            max_output_tokens: maxOutputTokens,
            store: false,
            ...(request.safetyIdentifier
              ? {
                  safety_identifier: hashSafetyIdentifier(
                    request.safetyIdentifier,
                  ),
                }
              : {}),
          }),
          signal: controller.signal,
        });
      } catch {
        const reason = timedOut ? "timeout" : "network_failure";
        logProviderFailure({
          provider: this.providerName,
          model: this.modelName,
          status: reason,
          latencyMs: Date.now() - startedAt,
          inputHash,
        });
        throw new AIUnavailableError({
          reason,
          provider: this.providerName,
          model: this.modelName,
        });
      }

      const requestId = getRequestId(response);
      if (!response.ok) {
        const latencyMs = Date.now() - startedAt;
        if (response.status === 429) {
          const retryAfterSeconds = parseRetryAfter(
            response.headers.get("retry-after"),
          );
          logProviderFailure({
            provider: this.providerName,
            model: this.modelName,
            status: response.status,
            latencyMs,
            requestId,
            inputHash,
          });
          throw new AIRateLimitedError({
            reason: "rate_limited",
            provider: this.providerName,
            model: this.modelName,
            requestId,
            retryAfterSeconds,
          });
        }

        logProviderFailure({
          provider: this.providerName,
          model: this.modelName,
          status: response.status,
          latencyMs,
          requestId,
          inputHash,
        });
        throw new AIUnavailableError({
          reason:
            response.status === 401 || response.status === 403
              ? "upstream_unauthorized"
              : "upstream_failure",
          provider: this.providerName,
          model: this.modelName,
          requestId,
        });
      }

      let payload: ResponsesPayload;
      try {
        payload = (await response.json()) as ResponsesPayload;
      } catch {
        const reason = timedOut ? "timeout" : "invalid_response";
        logProviderFailure({
          provider: this.providerName,
          model: this.modelName,
          status: reason,
          latencyMs: Date.now() - startedAt,
          requestId,
          inputHash,
        });
        throw new AIUnavailableError({
          reason,
          provider: this.providerName,
          model: this.modelName,
          requestId,
        });
      }

      if (typeof payload.status === "string" && payload.status !== "completed") {
        logProviderFailure({
          provider: this.providerName,
          model: this.modelName,
          status: payload.status,
          latencyMs: Date.now() - startedAt,
          requestId,
          inputHash,
        });
        throw new AIUnavailableError({
          reason: "invalid_response",
          provider: this.providerName,
          model: this.modelName,
          requestId,
        });
      }

      const outputText = extractOutputText(payload);
      if (!outputText) {
        logProviderFailure({
          provider: this.providerName,
          model: this.modelName,
          status: "invalid_response",
          latencyMs: Date.now() - startedAt,
          requestId,
          inputHash,
        });
        throw new AIUnavailableError({
          reason: "invalid_response",
          provider: this.providerName,
          model: this.modelName,
          requestId,
        });
      }

      let output: T;
      try {
        output = JSON.parse(outputText) as T;
      } catch {
        logProviderFailure({
          provider: this.providerName,
          model: this.modelName,
          status: "invalid_json",
          latencyMs: Date.now() - startedAt,
          requestId,
          inputHash,
        });
        throw new AIUnavailableError({
          reason: "invalid_json",
          provider: this.providerName,
          model: this.modelName,
          requestId,
        });
      }

      logger.info(
        {
          provider: this.providerName,
          model: this.modelName,
          status:
            typeof payload.status === "string"
              ? payload.status
              : response.status,
          latencyMs: Date.now() - startedAt,
          requestId,
          inputHash,
        },
        "OpenAI Responses request completed",
      );

      return {
        output,
        provider: this.providerName,
        model: this.modelName,
        requestId,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createConfiguredOpenAIResponsesProvider(
  env: OpenAIProviderEnvironment = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  },
): OpenAIResponsesProvider | undefined {
  if (env.AI_PROVIDER !== "openai" || !env.OPENAI_API_KEY) return undefined;
  return new OpenAIResponsesProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
  });
}

export function resolveOpenAIBaseUrl(baseUrl?: string) {
  const candidate = baseUrl?.trim() || DEFAULT_BASE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:")
      throw new Error("Only HTTPS is supported");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new AIUnavailableError({ reason: "invalid_provider_configuration" });
  }
}

function extractOutputText(payload: ResponsesPayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  for (const output of payload.output ?? []) {
    if (output.type !== "message") continue;
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

function hashSafetyIdentifier(identifier: string) {
  return hashValue(identifier).slice(0, 64);
}

function serializeInput(input: Record<string, unknown>) {
  try {
    const serialized = JSON.stringify(input);
    return typeof serialized === "string" ? serialized : undefined;
  } catch {
    return undefined;
  }
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getRequestId(response: Response) {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    undefined
  );
}

function parseRetryAfter(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.ceil(parsed), 1), 60)
    : 15;
}

function boundMaxOutputTokens(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), MAX_OUTPUT_TOKENS);
}

function logProviderFailure(input: {
  provider: string;
  model: string;
  status: number | string;
  latencyMs: number;
  requestId?: string;
  inputHash: string;
}) {
  logger.warn(input, "OpenAI Responses request unavailable");
}
