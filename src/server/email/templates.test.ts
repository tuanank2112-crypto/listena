import { describe, expect, it } from "vitest";
import {
  renderAccountExistsEmail,
  renderFeedbackNotificationEmail,
  renderFeedbackReceiptEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
} from "./templates";

describe("transactional email templates", () => {
  it("renders a safe verification action URL in HTML and plain text", () => {
    const email = renderVerificationEmail({
      to: "lan@example.com",
      recipientName: "Lan <script>",
      verificationUrl: "https://listenai.example/verify-email?token=one&next=learn",
      idempotencyKey: "verification-request-1",
    });

    expect(email).toMatchObject({
      to: "lan@example.com",
      subject: "Xác thực email cho tài khoản ListenAI",
      idempotencyKey: "verification-request-1",
    });
    expect(email.html).toContain("Lan &lt;script&gt;");
    expect(email.html).toContain("token=one&amp;next=learn");
    expect(email.text).toContain("https://listenai.example/verify-email?token=one&next=learn");
    expect(email.text).toContain("24 giờ");
  });

  it("renders a reset email and rejects non-HTTP action URLs without repeating them", () => {
    const reset = renderPasswordResetEmail({
      to: "lan@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=local-test-token",
    });

    expect(reset.subject).toBe("Đặt lại mật khẩu ListenAI");
    expect(reset.text).toContain("Đặt lại mật khẩu: http://localhost:3000/reset-password?token=local-test-token");
    expect(reset.text).toContain("một giờ");
    expect(() => renderPasswordResetEmail({
      to: "lan@example.com",
      resetUrl: "javascript:alert('token-must-not-leak')",
    })).toThrow("Email action URL must be an absolute HTTP(S) URL.");
  });

  it("renders the account-exists email with a reset link and a benign ignore notice", () => {
    const email = renderAccountExistsEmail({
      to: "lan@example.com",
      recipientName: "Lan",
      resetUrl: "https://listenai.example/reset-password?token=existing-account-token",
      idempotencyKey: "account-exists-1",
    });

    expect(email).toMatchObject({
      to: "lan@example.com",
      subject: "Tài khoản ListenAI của bạn đã tồn tại",
      idempotencyKey: "account-exists-1",
    });
    expect(email.text).toContain("Đặt lại mật khẩu: https://listenai.example/reset-password?token=existing-account-token");
    expect(email.text).toContain("tài khoản đã tồn tại");
    expect(email.html).toContain("Bạn đã có tài khoản ListenAI");
    expect(() => renderAccountExistsEmail({
      to: "lan@example.com",
      resetUrl: "javascript:alert(1)",
    })).toThrow("Email action URL must be an absolute HTTP(S) URL.");
  });

  it("keeps feedback acknowledgement free of the submitted feedback body", () => {
    const receipt = renderFeedbackReceiptEmail({
      to: "lan@example.com",
      recipientName: "Lan",
      replyTo: "support@listenai.example",
    });

    expect(receipt).toMatchObject({
      to: "lan@example.com",
      replyTo: "support@listenai.example",
      subject: "ListenAI đã nhận phản hồi của bạn",
    });
    expect(receipt.html).toContain("Cảm ơn bạn đã phản hồi");
  });

  it("renders a staff notification with escaped submitted fields and a safe sender reply address", () => {
    const notification = renderFeedbackNotificationEmail({
      to: "support@listenai.example",
      replyTo: "fallback@listenai.example",
      senderName: "<img src=x onerror=alert(1)>",
      senderEmail: "lan@example.com",
      feedbackSubject: "<script>alert(1)</script>",
      feedbackMessage: "Hello <strong>team</strong>\nPlease help.",
      idempotencyKey: "feedback-1",
    });

    expect(notification).toMatchObject({
      to: "support@listenai.example",
      replyTo: "lan@example.com",
      subject: "Phản hồi mới từ ListenAI",
      idempotencyKey: "feedback-1",
    });
    expect(notification.html).not.toContain("<img src=x");
    expect(notification.html).not.toContain("<script>");
    expect(notification.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(notification.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(notification.html).toContain("&lt;strong&gt;team&lt;/strong&gt;<br />Please help.");
    expect(notification.text).toContain("Chủ đề: <script>alert(1)</script>");
  });

  it("never promotes an invalid submitted email into a Reply-To header", () => {
    const notification = renderFeedbackNotificationEmail({
      to: "support@listenai.example",
      replyTo: "fallback@listenai.example",
      senderName: "Lan",
      senderEmail: "lan@example.com\r\nBcc: attacker@example.com",
      feedbackSubject: "Question",
      feedbackMessage: "Please help",
    });

    expect(notification.replyTo).toBe("fallback@listenai.example");
  });
});
