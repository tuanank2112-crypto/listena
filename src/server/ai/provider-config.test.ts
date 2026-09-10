import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIUnavailableError } from "@/server/ai/errors";
import {
  createConfiguredOpenAIResponsesProvider,
} from "./openai-responses-provider";
import { createAIProviderFromEnv } from "./provider";

describe("createAIProviderFromEnv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the configured base URL and model to OpenAI-compatible calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "resp_test",
      status: "completed",
      output_text: JSON.stringify({
        summaryVi: "Ổn",
        errors: [],
        recommendedActions: [],
      }),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAIProviderFromEnv({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "kira-3.5-flash",
      OPENAI_BASE_URL: "https://kira.example/api/v1",
    });

    await provider.analyzeErrors({
      transcript: "Hello",
      submittedAnswer: "Hello",
      wordDiffs: [],
      cefrLevel: "A2",
      errorTypes: [],
      safetyIdentifier: "learner-1",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kira.example/api/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "kira-3.5-flash",
      store: false,
      max_output_tokens: 1200,
      safety_identifier: createHash("sha256").update("learner-1").digest("hex"),
      text: {
        format: {
          type: "json_schema",
          strict: true,
          name: "error_analysis",
        },
      },
    });
  });

  it("does not select a mock provider when live configuration is absent", () => {
    expect(() => createAIProviderFromEnv({})).toThrow(AIUnavailableError);
  });

  it("selects Kira Chat Completions for every structured caller through the compatibility factory", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl_kira_123",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summaryVi: "Ổn",
                  errors: [],
                  recommendedActions: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createConfiguredOpenAIResponsesProvider({
      AI_PROVIDER: "kira",
      KIRAAI_API_KEY: "test-kira-key",
      KIRAAI_MODEL: "glm-5.3-flash-free",
      KIRAAI_BASE_URL: "https://kiraai.vn/api/v1",
    });
    expect(provider).toMatchObject({
      providerName: "kira",
      modelName: "glm-5.3-flash-free",
    });

    await provider?.generateJson({
      purpose: "error_analysis",
      systemPrompt: "Test prompt",
      input: {},
      schemaName: "error_analysis",
      schema: { type: "object", additionalProperties: false, properties: {} },
      maxOutputTokens: 1,
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kiraai.vn/api/v1/chat/completions");
  });
});
