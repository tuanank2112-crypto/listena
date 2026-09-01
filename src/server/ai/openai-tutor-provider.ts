import "server-only";

import logger from "@/lib/logger";
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

export function createConfiguredTutorProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.AI_PROVIDER !== "openai" || !apiKey) return undefined;

  return new OpenAICompatibleTutorProvider({
    apiKey,
    model: process.env.OPENAI_MODEL,
    baseUrl: process.env.OPENAI_BASE_URL,
  });
}

export class OpenAICompatibleTutorProvider implements TutorTurnProvider {
  readonly providerName = "openai";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAICompatibleTutorProviderConfig) {
    this.apiKey = config.apiKey;
    this.modelName = config.model ?? "gpt-4o-mini";
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  async generate(
    request: TutorProviderRequest,
  ): Promise<TutorProviderResponse> {
    const startedAt = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        temperature: request.purpose === "evaluate_turn" ? 0.25 : 0.45,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: JSON.stringify(request.input) },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, latencyMs: Date.now() - startedAt },
        "Tutor provider request failed",
      );
      throw new Error(`Tutor provider failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Tutor provider returned no content");
    }

    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new Error("Tutor provider returned invalid JSON");
    }

    return {
      output,
      provider: this.providerName,
      model: this.modelName,
    };
  }
}
