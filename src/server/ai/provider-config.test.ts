import { afterEach, describe, expect, it, vi } from "vitest";
import { createAIProviderFromEnv } from "./provider";

describe("createAIProviderFromEnv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the configured base URL and model to OpenAI-compatible calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summaryVi: "Ổn",
            errors: [],
            recommendedActions: [],
          }),
        },
      }],
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
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kira.example/api/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "kira-3.5-flash",
    });
  });
});
