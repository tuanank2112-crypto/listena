import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KiraChatCompletionsProvider,
  resolveKiraBaseUrl,
} from "./kira-chat-completions-provider";

describe("KiraChatCompletionsProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses Kira's documented Chat Completions payload and keeps identifiers local", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl_kira_123",
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify({ answer: "Xin chào" }) },
            },
          ],
        }),
        { status: 200, headers: { "x-request-id": "req_kira_123" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new KiraChatCompletionsProvider({
      apiKey: "test-kira-key",
      model: "glm-5.3-flash-free",
      baseUrl: "https://kiraai.vn/api/v1/",
    });

    const result = await provider.generateJson<{ answer: string }>({
      purpose: "lesson_tutor",
      systemPrompt: "Answer using verified context only.",
      input: { question: "What does hello mean?" },
      schemaName: "lesson_tutor_answer",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      },
      safetyIdentifier: "learner-42",
      maxOutputTokens: 700,
    });

    expect(result).toEqual({
      output: { answer: "Xin chào" },
      provider: "kira",
      model: "glm-5.3-flash-free",
      requestId: "req_kira_123",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kiraai.vn/api/v1/chat/completions");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-kira-key",
    });
    expect(init.redirect).toBe("manual");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model"]);
    expect(body).toMatchObject({
      model: "glm-5.3-flash-free",
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: expect.stringContaining("Return only one JSON object"),
        },
        {
          role: "user",
          content: expect.stringContaining("<server_input_json>"),
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("learner-42");
    expect(JSON.stringify(body)).not.toContain("test-kira-key");
  });

  it("only permits Kira's documented API origin before attaching credentials", () => {
    expect(resolveKiraBaseUrl("https://kiraai.vn/api/v1/")).toBe(
      "https://kiraai.vn/api/v1",
    );
    for (const unsafeBaseUrl of [
      "https://attacker.example/api/v1",
      "http://kiraai.vn/api/v1",
      "https://kiraai.vn/api/v1?redirect=https://attacker.example",
      "https://kiraai.vn/api/v1#fragment",
      "https://user:password@kiraai.vn/api/v1",
      "https://kiraai.vn/api/v2",
    ]) {
      expect(() => resolveKiraBaseUrl(unsafeBaseUrl)).toThrow(
        "Gia sư AI hiện chưa sẵn sàng",
      );
    }
  });

  it("maps Kira rate limits to a bounded typed retry response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("too many", {
          status: 429,
          headers: { "retry-after": "90" },
        }),
      ),
    );
    const provider = new KiraChatCompletionsProvider({ apiKey: "test-kira-key" });

    await expect(
      provider.generateJson({
        purpose: "lesson_tutor",
        systemPrompt: "Test prompt",
        input: {},
        schemaName: "answer",
        schema: { type: "object", additionalProperties: false, properties: {} },
        maxOutputTokens: 1,
      }),
    ).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
      status: 503,
      details: { retryAfterSeconds: 60 },
    });
  });

  it("does not follow an upstream redirect after attaching the credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/collect" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new KiraChatCompletionsProvider({ apiKey: "test-kira-key" });

    await expect(
      provider.generateJson({
        purpose: "lesson_tutor",
        systemPrompt: "Test prompt",
        input: {},
        schemaName: "answer",
        schema: { type: "object", additionalProperties: false, properties: {} },
        maxOutputTokens: 1,
      }),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { reason: "upstream_failure" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://kiraai.vn/api/v1/chat/completions",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("waits past 20 seconds for a queued Kira generation, but remains bounded", async () => {
    vi.useFakeTimers();
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveResponse = resolve;
          (init.signal as AbortSignal).addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new KiraChatCompletionsProvider({ apiKey: "test-kira-key" });

    const pending = provider.generateJson<{ answer: string }>({
      purpose: "lesson_tutor",
      systemPrompt: "Test prompt",
      input: {},
      schemaName: "answer",
      schema: { type: "object", additionalProperties: false, properties: {} },
      maxOutputTokens: 1,
    });
    await vi.advanceTimersByTimeAsync(20_001);
    resolveResponse?.(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: '{"answer":"OK"}' } }],
        }),
        { status: 200 },
      ),
    );

    await expect(pending).resolves.toMatchObject({ output: { answer: "OK" } });
  });

  it("fails closed on non-JSON Chat Completions text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not JSON" } }],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new KiraChatCompletionsProvider({ apiKey: "test-kira-key" });

    await expect(
      provider.generateJson({
        purpose: "lesson_tutor",
        systemPrompt: "Test prompt",
        input: {},
        schemaName: "answer",
        schema: { type: "object", additionalProperties: false, properties: {} },
        maxOutputTokens: 1,
      }),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { reason: "invalid_json" },
    });
  });
});
