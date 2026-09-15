"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, LoaderCircle, MailCheck, MessageSquareText, RefreshCw } from "lucide-react";
import { AccountPageShell } from "@/components/account-page-shell";

type FeedbackReceipt = {
  deliveryUnavailable: boolean;
  id: string;
};

function emailIsVerified(user: { isEmailVerified?: boolean } | undefined) {
  return user?.isEmailVerified === true;
}

export default function FeedbackPage() {
  const { data: session, status } = useSession();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");

  const user = session?.user as ({ email?: string | null; isEmailVerified?: boolean } | undefined);
  const verified = emailIsVerified(user) && !verificationRequired;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        delivery?: string;
        error?: string;
        id?: string;
      };

      if (response.ok && payload.id) {
        setSubject("");
        setMessage("");
        setReceipt({
          id: payload.id,
          deliveryUnavailable: payload.delivery === "EMAIL_UNAVAILABLE" || payload.delivery === "unavailable",
        });
      } else if (response.status === 401) {
        setError("Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại để gửi phản hồi.");
      } else if (response.status === 403 || payload.code === "EMAIL_NOT_VERIFIED") {
        setVerificationRequired(true);
      } else {
        setError(payload.error || "Chưa thể ghi nhận phản hồi. Vui lòng thử lại sau.");
      }
    } catch {
      setError("Chưa thể ghi nhận phản hồi. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return;

    setResendingVerification(true);
    setVerificationMessage("");
    try {
      const response = await fetch("/api/account/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setVerificationMessage(
        response.ok
          ? "Nếu địa chỉ này đủ điều kiện, email xác thực mới sẽ sớm đến hộp thư của bạn."
          : "Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.",
      );
    } catch {
      setVerificationMessage("Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
    } finally {
      setResendingVerification(false);
    }
  }

  if (status === "loading") {
    return (
      <AccountPageShell eyebrow="Phản hồi" title="Đang kiểm tra tài khoản…">
        <p aria-live="polite" className="mt-7 text-sm font-bold text-[#68766f]" role="status">
          Chúng tôi đang kiểm tra quyền gửi phản hồi của bạn.
        </p>
      </AccountPageShell>
    );
  }

  if (!user) {
    return (
      <AccountPageShell
        description="Bạn cần đăng nhập để phản hồi được gắn đúng với tài khoản học tập của mình."
        eyebrow="Phản hồi"
        title="Đăng nhập để gửi phản hồi."
      >
        <Link
          className="mt-7 flex min-h-12 items-center justify-center rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"
          href="/login"
        >
          Đăng nhập
        </Link>
      </AccountPageShell>
    );
  }

  if (!verified) {
    return (
      <AccountPageShell
        description="Chúng tôi cần xác thực email trước khi nhận phản hồi để bảo vệ người học và giúp nhóm hỗ trợ trả lời đúng người."
        eyebrow="Phản hồi"
        title="Xác thực email trước."
      >
        <div className="mt-7 rounded-2xl bg-[#fff1bd] p-4 text-[#805c15]" role="alert">
          <MailCheck className="h-6 w-6" />
          <p className="mt-3 text-sm font-bold leading-6">Bạn chưa thể gửi phản hồi trước khi xác thực quyền sở hữu email.</p>
        </div>
        <button
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-50"
          disabled={resendingVerification || !user.email}
          onClick={() => void resendVerification()}
          type="button"
        >
          {resendingVerification ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {resendingVerification ? "Đang gửi…" : "Gửi lại email xác thực"}
        </button>
        {verificationMessage ? (
          <p aria-live="polite" className="mt-3 text-sm font-bold leading-6 text-[#68766f]" role="status">
            {verificationMessage}
          </p>
        ) : null}
      </AccountPageShell>
    );
  }

  if (receipt) {
    return (
      <AccountPageShell
        description="Phản hồi của bạn đã được gắn với tài khoản đã xác thực."
        eyebrow="Phản hồi đã ghi nhận"
        title="Cảm ơn bạn đã góp ý."
      >
        <div className="mt-7 rounded-2xl bg-[#dff2e8] p-4 text-[#245340]" role="status">
          <CheckCircle2 className="h-7 w-7" />
          <p className="mt-3 text-sm font-black">Mã tiếp nhận: {receipt.id}</p>
          <p className="mt-1 text-sm font-bold leading-6">
            {receipt.deliveryUnavailable
              ? "Phản hồi đã được lưu. Thông báo cho nhóm hỗ trợ chưa gửi được ngay và sẽ cần được gửi lại sau."
              : "Phản hồi đã được lưu để nhóm hỗ trợ xem xét."}
          </p>
        </div>
        <button
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#eee7da] px-4 text-sm font-black text-[#176b55]"
          onClick={() => setReceipt(null)}
          type="button"
        >
          Gửi thêm phản hồi
        </button>
      </AccountPageShell>
    );
  }

  return (
    <AccountPageShell
      description="Nêu điều bạn gặp phải hoặc ý tưởng cải thiện. Phản hồi được gắn với tài khoản đã xác thực để nhóm hỗ trợ có thể theo dõi đúng ngữ cảnh."
      eyebrow="Phản hồi"
      title="Gửi góp ý cho ListenAI."
    >
      <form autoComplete="off" className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-black" htmlFor="feedback-subject">
          Chủ đề
          <input
            autoComplete="off"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="feedback-subject"
            maxLength={160}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Ví dụ: Tôi gặp khó khăn khi…"
            required
            type="text"
            value={subject}
          />
        </label>
        <label className="block text-sm font-black" htmlFor="feedback-message">
          Nội dung
          <textarea
            autoComplete="off"
            className="mt-2 min-h-36 w-full resize-y rounded-2xl border-2 border-[#ded8cc] bg-white px-4 py-3 font-bold outline-none focus:border-[#176b55]"
            id="feedback-message"
            maxLength={4000}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mô tả điều bạn thấy, bước bạn đã thử và điều bạn mong muốn."
            required
            rows={6}
            value={message}
          />
        </label>
        {error ? <p className="text-sm font-bold text-[#d6534d]" role="alert">{error}</p> : null}
        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
          {loading ? "Đang gửi…" : "Gửi phản hồi"}
        </button>
      </form>
    </AccountPageShell>
  );
}
