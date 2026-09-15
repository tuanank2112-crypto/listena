import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  createConfiguredEmailDelivery,
  EmailDeliveryUnavailableError,
  isEmailDeliveryUnavailableError,
  renderFeedbackNotificationEmail,
  renderFeedbackReceiptEmail,
} from "@/server/email";
import { FeedbackSchema } from "@/server/validation/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();
  if (!session.user.isEmailVerified) return verificationRequiredResponse();

  let parsed: ReturnType<typeof FeedbackSchema.safeParse>;
  try {
    parsed = FeedbackSchema.safeParse(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequestResponse();
    throw error;
  }
  if (!parsed.success) return invalidRequestResponse();

  let user: { id: string; name: string; email: string; emailVerifiedAt: Date | null } | null;
  let feedback: { id: string };
  try {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt) return verificationRequiredResponse();

    feedback = await prisma.feedbackMessage.create({
      data: {
        userId: user.id,
        subject: parsed.data.subject,
        message: parsed.data.message,
        deliveryStatus: "PENDING",
      },
      select: { id: true },
    });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error({ userId: session.user.id }, "Feedback persistence failed");
    return NextResponse.json(
      { error: "Chưa thể lưu phản hồi lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: noStoreHeaders },
    );
  }

  try {
    const delivery = createConfiguredEmailDelivery();
    const supportEmail = requiredSupportEmail();

    await delivery.send(renderFeedbackNotificationEmail({
      to: supportEmail,
      replyTo: process.env.EMAIL_REPLY_TO,
      senderName: user.name,
      senderEmail: user.email,
      feedbackSubject: parsed.data.subject,
      feedbackMessage: parsed.data.message,
      idempotencyKey: `feedback-support-${feedback.id}`,
    }));
    await delivery.send(renderFeedbackReceiptEmail({
      to: user.email,
      recipientName: user.name,
      // A receipt can be replied to without exposing a learner-controlled
      // header. Use the explicitly configured reply inbox when present, then
      // the controlled support mailbox that received this feedback.
      replyTo: process.env.EMAIL_REPLY_TO?.trim() || supportEmail,
      idempotencyKey: `feedback-receipt-${feedback.id}`,
    }));

    await prisma.feedbackMessage.update({
      where: { id: feedback.id },
      data: { deliveryStatus: "SENT", deliveredAt: new Date() },
    });

    return NextResponse.json(
      { id: feedback.id, delivery: "sent" },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    // The feedback is already durable. Do not ask the browser to retry a
    // submission that may have reached support before the provider failed.
    try {
      await prisma.feedbackMessage.update({
        where: { id: feedback.id },
        data: { deliveryStatus: "EMAIL_UNAVAILABLE" },
      });
    } catch {
      // The original feedback row remains the durable record even if this
      // best-effort delivery status cannot be updated during an outage.
    }

    logger.warn(
      {
        userId: user.id,
        feedbackId: feedback.id,
        reason: isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown",
      },
      "Feedback email delivery unavailable",
    );
    return NextResponse.json(
      { id: feedback.id, delivery: "unavailable" },
      { status: 202, headers: noStoreHeaders },
    );
  }
}

const noStoreHeaders = { "Cache-Control": "no-store" };

function requiredSupportEmail() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  if (!supportEmail) {
    throw new EmailDeliveryUnavailableError({
      reason: "invalid_provider_configuration",
    });
  }
  return supportEmail;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: noStoreHeaders },
  );
}

function verificationRequiredResponse() {
  return NextResponse.json(
    { error: "Email verification is required.", code: "EMAIL_NOT_VERIFIED" },
    { status: 403, headers: noStoreHeaders },
  );
}

function invalidRequestResponse() {
  return NextResponse.json(
    { error: "Dữ liệu không hợp lệ" },
    { status: 400, headers: noStoreHeaders },
  );
}
