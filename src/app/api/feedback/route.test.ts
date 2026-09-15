import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TestEmailDeliveryUnavailableError extends Error {
    constructor(readonly details: { reason: string }) {
      super("email delivery unavailable");
    }
  }

  return {
    auth: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createConfiguredEmailDelivery: vi.fn(),
    send: vi.fn(),
    renderFeedbackNotificationEmail: vi.fn(),
    renderFeedbackReceiptEmail: vi.fn(),
    isEmailDeliveryUnavailableError: vi.fn(),
    EmailDeliveryUnavailableError: TestEmailDeliveryUnavailableError,
    warn: vi.fn(),
    error: vi.fn(),
  };
});

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    feedbackMessage: { create: mocks.create, update: mocks.update },
  },
}));
vi.mock("@/server/email", () => ({
  createConfiguredEmailDelivery: mocks.createConfiguredEmailDelivery,
  EmailDeliveryUnavailableError: mocks.EmailDeliveryUnavailableError,
  isEmailDeliveryUnavailableError: mocks.isEmailDeliveryUnavailableError,
  renderFeedbackNotificationEmail: mocks.renderFeedbackNotificationEmail,
  renderFeedbackReceiptEmail: mocks.renderFeedbackReceiptEmail,
}));
vi.mock("@/lib/logger", () => ({
  default: { warn: mocks.warn, error: mocks.error },
}));

import { POST } from "./route";

const originalSupportEmail = process.env.SUPPORT_EMAIL;
const originalReplyTo = process.env.EMAIL_REPLY_TO;

const user = {
  id: "learner-1",
  name: "Lan",
  email: "learner@example.com",
  emailVerifiedAt: new Date("2026-09-15T00:00:00.000Z"),
};

const feedback = {
  subject: "Lesson suggestion",
  message: "Please add more listening practice.",
};

function request(body: unknown = feedback) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restoreEnvironment(name: "SUPPORT_EMAIL" | "EMAIL_REPLY_TO", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPPORT_EMAIL = "support@example.com";
    process.env.EMAIL_REPLY_TO = "noreply@example.com";
    mocks.auth.mockResolvedValue({ user: { id: user.id, isEmailVerified: true } });
    mocks.findUnique.mockResolvedValue(user);
    mocks.create.mockResolvedValue({ id: "feedback-1" });
    mocks.update.mockResolvedValue({});
    mocks.createConfiguredEmailDelivery.mockReturnValue({ send: mocks.send });
    mocks.send.mockResolvedValue({ provider: "resend", messageId: "message-1" });
    mocks.renderFeedbackNotificationEmail.mockReturnValue({ kind: "support" });
    mocks.renderFeedbackReceiptEmail.mockReturnValue({ kind: "receipt" });
    mocks.isEmailDeliveryUnavailableError.mockImplementation(
      (error: unknown) => error instanceof mocks.EmailDeliveryUnavailableError,
    );
  });

  afterEach(() => {
    restoreEnvironment("SUPPORT_EMAIL", originalSupportEmail);
    restoreEnvironment("EMAIL_REPLY_TO", originalReplyTo);
  });

  it("rejects unauthenticated and session-unverified requests before persistence", async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const unauthenticated = await POST(request());

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(unauthenticated.headers.get("Cache-Control")).toBe("no-store");

    mocks.auth.mockResolvedValueOnce({ user: { id: user.id, isEmailVerified: false } });
    const unverified = await POST(request());

    expect(unverified.status).toBe(403);
    await expect(unverified.json()).resolves.toEqual({
      error: "Email verification is required.",
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checks current database verification even when a stale session says verified", async () => {
    mocks.findUnique.mockResolvedValue({ ...user, emailVerifiedAt: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Email verification is required.",
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("persists verified feedback before delivering support notification and receipt", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "feedback-1", delivery: "sent" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        subject: feedback.subject,
        message: feedback.message,
        deliveryStatus: "PENDING",
      },
      select: { id: true },
    });
    expect(mocks.renderFeedbackNotificationEmail).toHaveBeenCalledWith({
      to: "support@example.com",
      replyTo: "noreply@example.com",
      senderName: user.name,
      senderEmail: user.email,
      feedbackSubject: feedback.subject,
      feedbackMessage: feedback.message,
      idempotencyKey: "feedback-support-feedback-1",
    });
    expect(mocks.renderFeedbackReceiptEmail).toHaveBeenCalledWith({
      to: user.email,
      recipientName: user.name,
      idempotencyKey: "feedback-receipt-feedback-1",
    });
    expect(mocks.send).toHaveBeenNthCalledWith(1, { kind: "support" });
    expect(mocks.send).toHaveBeenNthCalledWith(2, { kind: "receipt" });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "feedback-1" },
      data: { deliveryStatus: "SENT", deliveredAt: expect.any(Date) },
    });
  });

  it("keeps the feedback durable and returns 202 when email delivery is unavailable", async () => {
    mocks.send.mockRejectedValue(
      new mocks.EmailDeliveryUnavailableError({ reason: "network_failure" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ id: "feedback-1", delivery: "unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.renderFeedbackReceiptEmail).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "feedback-1" },
      data: { deliveryStatus: "EMAIL_UNAVAILABLE" },
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      { userId: user.id, feedbackId: "feedback-1", reason: "network_failure" },
      "Feedback email delivery unavailable",
    );
  });
});
