import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OpenAICompatibleTutorProvider } from "@/server/ai/openai-tutor-provider";
import { OpenAIResponsesProvider } from "@/server/ai/openai-responses-provider";

const validTutorOutput = {
  npcReply: "What would you like to order?",
  coachMessage: "Hãy trả lời bằng một câu đầy đủ.",
  pedagogicalAct: "ASK_GUIDING",
  targetSkill: "communication",
  score: 0.2,
  confidence: 0.9,
  detectedError: null,
  statePatch: {
    phase: "ENCOUNTER",
    trustDelta: 0,
    evidenceDelta: 0,
    successfulTurn: false,
    recovered: false,
  },
  intervention: null,
  shouldComplete: false,
};

describe("OpenAICompatibleTutorProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the Responses API strict schema and only hashes the learner identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "resp_123",
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(validTutorOutput) },
              ],
            },
          ],
        }),
        { status: 200, headers: { "x-request-id": "req_123" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleTutorProvider({
      apiKey: "test-key",
      model: "gpt-test",
      baseUrl: "https://api.example/v1/",
    });

    const result = await provider.generate({
      purpose: "evaluate_turn",
      systemPrompt: "Tutor system prompt",
      input: { learnerMessage: "I would like tea." },
      safetyIdentifier: "learner-42",
    });

    expect(result).toMatchObject({
      output: validTutorOutput,
      provider: "openai",
      model: "gpt-test",
      requestId: "req_123",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/responses");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-test",
      store: false,
      max_output_tokens: 1200,
      safety_identifier: createHash("sha256")
        .update("learner-42")
        .digest("hex"),
      text: {
        format: {
          type: "json_schema",
          name: "tutor_turn",
          strict: true,
        },
      },
    });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect(JSON.stringify(body)).not.toContain("learner-42");
  });

  it("maps an upstream 429 to a bounded typed retry response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("too many", {
            status: 429,
            headers: { "retry-after": "13" },
          }),
        ),
    );
    const provider = new OpenAICompatibleTutorProvider({ apiKey: "test-key" });

    await expect(
      provider.generate({
        purpose: "start_mission",
        systemPrompt: "Tutor system prompt",
        input: {},
      }),
    ).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
      status: 503,
      details: { retryAfterSeconds: 13 },
    });
  });

  it("does not turn malformed upstream content into a deterministic response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ output_text: "not JSON" }), {
            status: 200,
          }),
        ),
    );
    const provider = new OpenAICompatibleTutorProvider({ apiKey: "test-key" });

    await expect(
      provider.generate({
        purpose: "start_mission",
        systemPrompt: "Tutor system prompt",
        input: {},
      }),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { reason: "invalid_json" },
    });
  });

  it("caps an exported structured-provider call at the server output budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "completed", output_text: "{}" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAIResponsesProvider({ apiKey: "test-key" });

    await provider.generateJson({
      purpose: "personalized_lesson",
      systemPrompt: "Test prompt",
      input: {},
      schemaName: "test_schema",
      schema: { type: "object", additionalProperties: false, properties: {} },
      maxOutputTokens: 99_999,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      max_output_tokens: 4_000,
    });
  });

  it("keeps the request deadline active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    let responseSignal: AbortSignal | undefined;
    const responseJson = vi.fn(
      () =>
        new Promise<unknown>((_resolve, reject) => {
          responseSignal?.addEventListener(
            "abort",
            () => reject(new Error("body read aborted")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        responseSignal = init.signal ?? undefined;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: responseJson,
        } as unknown as Response);
      }),
    );
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      timeoutMs: 5,
    });

    const pending = provider.generateJson({
      purpose: "tutor_turn",
      systemPrompt: "Test prompt",
      input: {},
      schemaName: "test_schema",
      schema: { type: "object", additionalProperties: false, properties: {} },
      maxOutputTokens: 1,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(responseJson).toHaveBeenCalledOnce();
    const rejected = expect(pending).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { reason: "timeout" },
    });

    await vi.advanceTimersByTimeAsync(5);

    expect(responseSignal?.aborted).toBe(true);
    await rejected;
  });

  it("turns an unserializable internal input into a typed unavailable result", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAIResponsesProvider({ apiKey: "test-key" });
    const circularInput: Record<string, unknown> = {};
    circularInput.self = circularInput;

    await expect(
      provider.generateJson({
        purpose: "tutor_turn",
        systemPrompt: "Test prompt",
        input: circularInput,
        schemaName: "test_schema",
        schema: { type: "object", additionalProperties: false, properties: {} },
        maxOutputTokens: 1,
      }),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { reason: "invalid_input" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
