import type { OutboundEmail } from "./contracts";

type EmailTemplateBase = {
  to: string;
  recipientName?: string | null;
  replyTo?: string;
  idempotencyKey?: string;
};

export type VerificationEmailInput = EmailTemplateBase & {
  verificationUrl: string;
};

export type PasswordResetEmailInput = EmailTemplateBase & {
  resetUrl: string;
};

export type AccountExistsEmailInput = EmailTemplateBase & {
  resetUrl: string;
};

export type FeedbackReceiptEmailInput = EmailTemplateBase;

export type FeedbackNotificationEmailInput = {
  /** The support inbox that receives the notification. */
  to: string;
  /** A trusted fallback reply address when the submitted sender email is invalid. */
  replyTo?: string;
  senderName: string;
  senderEmail: string;
  feedbackSubject: string;
  feedbackMessage: string;
  idempotencyKey?: string;
};

/** Render the account-ownership confirmation email without exposing any data in logs. */
export function renderVerificationEmail(
  input: VerificationEmailInput,
): OutboundEmail {
  return renderActionEmail({
    ...input,
    actionUrl: input.verificationUrl,
    subject: "Xác thực email cho tài khoản ListenAI",
    headline: "Xác thực địa chỉ email của bạn",
    actionLabel: "Xác thực email",
    body: "Hãy xác thực địa chỉ email để bắt đầu học cùng ListenAI. Liên kết này có hiệu lực trong 24 giờ.",
    ignoreNotice:
      "Nếu bạn không tạo tài khoản ListenAI, bạn có thể bỏ qua email này.",
  });
}

/** Render the one-time password-reset email. Token expiry and consumption stay in the auth service. */
export function renderPasswordResetEmail(
  input: PasswordResetEmailInput,
): OutboundEmail {
  return renderActionEmail({
    ...input,
    actionUrl: input.resetUrl,
    subject: "Đặt lại mật khẩu ListenAI",
    headline: "Đặt lại mật khẩu của bạn",
    actionLabel: "Đặt lại mật khẩu",
    body: "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ListenAI của bạn. Liên kết này có hiệu lực trong một giờ.",
    ignoreNotice:
      "Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email này. Mật khẩu hiện tại sẽ không thay đổi.",
  });
}

/**
 * Sent when someone registers with an address that already has a verified
 * account. The web response is identical to a fresh registration, so this
 * message is the only place the account owner learns about the attempt. It
 * carries a one-time password-reset link because "I forgot I had an account"
 * is the common benign cause.
 */
export function renderAccountExistsEmail(
  input: AccountExistsEmailInput,
): OutboundEmail {
  return renderActionEmail({
    ...input,
    actionUrl: input.resetUrl,
    subject: "Tài khoản ListenAI của bạn đã tồn tại",
    headline: "Bạn đã có tài khoản ListenAI",
    actionLabel: "Đặt lại mật khẩu",
    body: "Vừa có yêu cầu tạo tài khoản mới với địa chỉ email này, nhưng tài khoản đã tồn tại. Nếu đó là bạn và bạn quên mật khẩu, hãy dùng liên kết dưới đây để đặt lại. Liên kết có hiệu lực trong một giờ.",
    ignoreNotice:
      "Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email. Tài khoản và mật khẩu hiện tại sẽ không thay đổi.",
  });
}

/**
 * A short acknowledgement for a future support/feedback route. It intentionally
 * does not repeat the learner's submitted content into an email.
 */
export function renderFeedbackReceiptEmail(
  input: FeedbackReceiptEmailInput,
): OutboundEmail {
  const greeting = greetingFor(input.recipientName);
  return {
    to: input.to.trim(),
    subject: "ListenAI đã nhận phản hồi của bạn",
    html: documentHtml(
      "Cảm ơn bạn đã phản hồi",
      [
        greeting,
        "Cảm ơn bạn đã gửi phản hồi cho ListenAI. Chúng tôi đã nhận được và sẽ xem xét sớm nhất có thể.",
      ],
    ),
    text: [
      greeting,
      "Cảm ơn bạn đã gửi phản hồi cho ListenAI. Chúng tôi đã nhận được và sẽ xem xét sớm nhất có thể.",
    ].join("\n\n"),
    ...optionalMetadata(input),
  };
}

/**
 * Renders the staff-facing notification for a learner's feedback. Submitted
 * fields are never used as message headers; the sender email becomes Reply-To
 * only when it is a single safe mailbox address.
 */
export function renderFeedbackNotificationEmail(
  input: FeedbackNotificationEmailInput,
): OutboundEmail {
  const senderEmail = input.senderEmail.trim();
  const fallbackReplyTo = input.replyTo?.trim();
  const replyTo = isMailbox(senderEmail)
    ? senderEmail
    : fallbackReplyTo && isMailbox(fallbackReplyTo)
      ? fallbackReplyTo
      : undefined;

  const name = displayValue(input.senderName);
  const subject = displayValue(input.feedbackSubject);
  const message = displayValue(input.feedbackMessage);
  const entries = [
    `<p style="margin: 0 0 12px;"><strong>Người gửi:</strong> ${escapeHtml(name)}</p>`,
    `<p style="margin: 0 0 12px;"><strong>Email:</strong> ${escapeHtml(senderEmail || "Không cung cấp")}</p>`,
    `<p style="margin: 0 0 12px;"><strong>Chủ đề:</strong> ${escapeHtml(subject)}</p>`,
    `<p style="margin: 0 0 12px;"><strong>Nội dung:</strong><br />${escapeMultilineHtml(message)}</p>`,
  ];

  return {
    to: input.to.trim(),
    // Keep user-supplied text out of the MIME subject header.
    subject: "Phản hồi mới từ ListenAI",
    html: documentHtml("Phản hồi mới", entries, true),
    text: [
      "Phản hồi mới từ ListenAI",
      `Người gửi: ${name}`,
      `Email: ${senderEmail || "Không cung cấp"}`,
      `Chủ đề: ${subject}`,
      "Nội dung:",
      message,
    ].join("\n"),
    ...optionalMetadata({
      to: input.to,
      replyTo,
      idempotencyKey: input.idempotencyKey,
    }),
  };
}

function renderActionEmail(input: EmailTemplateBase & {
  actionUrl: string;
  subject: string;
  headline: string;
  actionLabel: string;
  body: string;
  ignoreNotice: string;
}): OutboundEmail {
  const actionUrl = safeActionUrl(input.actionUrl);
  const safeUrl = escapeHtml(actionUrl);
  const greeting = greetingFor(input.recipientName);
  const actionLink = `<p style="margin: 28px 0;"><a href="${safeUrl}" style="display: inline-block; border-radius: 8px; background: #176b55; color: #ffffff; padding: 12px 18px; font-weight: 700; text-decoration: none;" rel="noreferrer">${escapeHtml(input.actionLabel)}</a></p>`;

  return {
    to: input.to.trim(),
    subject: input.subject,
    html: documentHtml(
      input.headline,
      [greeting, input.body, actionLink, input.ignoreNotice],
      true,
    ),
    text: [
      greeting,
      input.body,
      `${input.actionLabel}: ${actionUrl}`,
      input.ignoreNotice,
    ].join("\n\n"),
    ...optionalMetadata(input),
  };
}

function optionalMetadata(input: EmailTemplateBase) {
  return {
    ...(input.replyTo?.trim() ? { replyTo: input.replyTo.trim() } : {}),
    ...(input.idempotencyKey?.trim()
      ? { idempotencyKey: input.idempotencyKey.trim() }
      : {}),
  };
}

function greetingFor(name: string | null | undefined) {
  const normalized = name?.trim();
  return normalized ? `Chào ${escapeHtml(normalized)},` : "Chào bạn,";
}

function displayValue(value: string) {
  return value.trim() || "Không cung cấp";
}

function isMailbox(value: string) {
  return !/[\r\n]/.test(value)
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}

function documentHtml(
  headline: string,
  paragraphs: string[],
  paragraphsContainHtml = false,
) {
  const content = paragraphs
    .map((paragraph) => paragraphsContainHtml && paragraph.startsWith("<p")
      ? paragraph
      : `<p style="margin: 0 0 16px;">${paragraph}</p>`)
    .join("");
  return `<!doctype html><html lang="vi"><body style="margin: 0; background: #f4efe5; color: #18332d; font-family: Arial, sans-serif;"><main style="max-width: 560px; margin: 32px auto; border-radius: 16px; background: #fffdf8; padding: 32px;"><h1 style="margin: 0 0 24px; font-size: 24px;">${escapeHtml(headline)}</h1>${content}</main></body></html>`;
}

function safeActionUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:")
      || !url.hostname
      || url.username
      || url.password
    ) {
      throw new Error("unsafe action URL");
    }
    return url.toString();
  } catch {
    // Do not include the rejected URL: it can carry an account action token.
    throw new Error("Email action URL must be an absolute HTTP(S) URL.");
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeMultilineHtml(value: string) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");
}
