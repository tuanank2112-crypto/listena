import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConfiguredEmailDelivery,
  EmailDeliveryUnavailableError,
  ResendEmailDelivery,
} from "./index";

const senderConfig = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM: "ListenAI <noreply@listenai.example>",
  EMAIL_REPLY_TO: "support@listenai.example",
};

const email = {
  to: "lan@example.com",
  subject: "Verify your account",
  html: "<p>Verify</p>",
  text: "Verify",
  idempotencyKey: "email-request-1",
};

describe("ResendEmailDelivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses Resend's HTTPS JSON contract and keeps the configured key out of the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const delivery = createConfiguredEmailDelivery(senderConfig);
    await expect(delivery.send(email)).resolves.toEqual({
      provider: "resend",
      messageId: "email_123",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer test-resend-key",
      "Idempotency-Key": "email-request-1",
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      from: "ListenAI <noreply@listenai.example>",
      to: ["lan@example.com"],
      subject: "Verify your account",
      html: "<p>Verify</p>",
      text: "Verify",
      reply_to: "support@listenai.example",
    });
    expect(JSON.stringify(body)).not.toContain("test-resend-key");
  });

  it("fails closed when configuration is missing or malformed", () => {
    expect(() => createConfiguredEmailDelivery({
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "noreply@listenai.example",
    })).toThrow(EmailDeliveryUnavailableError);
    expect(() => createConfiguredEmailDelivery({
      EMAIL_PROVIDER: "unsupported-provider",
      RESEND_API_KEY: "key",
      EMAIL_FROM: "noreply@listenai.example",
    })).toThrow(EmailDeliveryUnavailableError);
    expect(() => createConfiguredEmailDelivery({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "key",
      EMAIL_FROM: "bad\nheader@example.com",
    })).toThrow(EmailDeliveryUnavailableError);
  });

  it.each([
    [401, "upstream_unauthorized"],
    [429, "rate_limited"],
    [500, "upstream_failure"],
    [302, "upstream_failure"],
  ] as const)("maps upstream %i to a typed %s error", async (status, reason) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    const delivery = createConfiguredEmailDelivery(senderConfig);

    await expect(delivery.send(email)).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_UNAVAILABLE",
      status: 503,
      details: { reason },
    });
  });

  it("maps malformed success responses and invalid messages to typed unavailable errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const delivery = createConfiguredEmailDelivery(senderConfig);

    await expect(delivery.send(email)).rejects.toMatchObject({
      details: { reason: "invalid_response" },
    });
    await expect(delivery.send({ ...email, to: "not-an-email" })).rejects.toMatchObject({
      details: { reason: "invalid_message" },
    });
  });

  it("maps an aborted provider call to a bounded timeout without exposing request data", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      (init.signal as AbortSignal).addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = new ResendEmailDelivery({
      apiKey: "test-resend-key",
      from: "noreply@listenai.example",
      timeoutMs: 1,
    });

    const pending = delivery.send(email);
    const rejection = expect(pending).rejects.toMatchObject({
      details: { reason: "timeout" },
    });
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
  });
});
