"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { AccountPageShell } from "@/components/account-page-shell";

const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn === 0) return;
    const timeout = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendIn]);

  async function requestVerification(address: string) {
    const response = await fetch("/api/account/verification/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    });

    return response.ok;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    setError("");
    setDeliveryMessage("");

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: normalizedEmail, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        verificationEmailSent?: boolean;
      };

      if (!response.ok) {
        setError(payload.error || "Chưa tạo được tài khoản.");
        return;
      }

      setPassword("");
      setRegisteredEmail(normalizedEmail);
      setResendIn(RESEND_COOLDOWN_SECONDS);

      if (!payload.verificationEmailSent) {
        setDeliveryMessage("Tài khoản đã được tạo, nhưng email xác thực đang tạm thời chưa gửi được. Hãy thử gửi lại sau ít phút.");
      }
    } catch {
      setError("Không thể tạo tài khoản lúc này. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!registeredEmail || resendIn > 0) return;
    setResending(true);
    setDeliveryMessage("");
    try {
      const accepted = await requestVerification(registeredEmail);
      setDeliveryMessage(
        accepted
          ? "Nếu địa chỉ này đủ điều kiện, email xác thực mới sẽ sớm đến hộp thư của bạn."
          : "Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.",
      );
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch {
      setDeliveryMessage("Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
    } finally {
      setResending(false);
    }
  }

  if (registeredEmail) {
    return (
      <AccountPageShell
        description="Bạn cần xác thực quyền sở hữu hộp thư trước khi có thể đăng nhập và bắt đầu học."
        eyebrow="Kiểm tra hộp thư"
        title="Xác thực email của bạn."
      >
        <div className="mt-7 rounded-2xl bg-[#dff2e8] p-4 text-[#245340]">
          <CheckCircle2 className="h-6 w-6" />
          <p className="mt-3 text-sm font-black">Tài khoản đã được tạo.</p>
          <p className="mt-1 text-sm font-bold leading-6">
            Hãy mở email gửi tới <span className="font-black">{maskEmail(registeredEmail)}</span> và làm theo liên kết xác thực.
          </p>
        </div>

        {deliveryMessage ? (
          <p aria-live="polite" className="mt-4 rounded-2xl bg-[#f4efe5] px-4 py-3 text-sm font-bold leading-6 text-[#68766f]" role="status">
            {deliveryMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-50"
            disabled={resending || resendIn > 0}
            onClick={() => void resendVerification()}
            type="button"
          >
            {resending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {resending ? "Đang gửi…" : resendIn > 0 ? `Gửi lại sau ${resendIn}s` : "Gửi lại email"}
          </button>
          <Link
            className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-[#eee7da] px-4 text-sm font-black"
            href="/login"
          >
            Đăng nhập sau khi xác thực
          </Link>
        </div>
      </AccountPageShell>
    );
  }

  return (
    <AccountPageShell eyebrow="Join the studio" title="Tạo tài khoản.">
      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block text-sm font-black" htmlFor="register-name">
          Họ tên
          <input
            autoComplete="name"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="register-name"
            name="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Nguyễn Văn A"
            required
            type="text"
            value={name}
          />
        </label>

        <label className="block text-sm font-black" htmlFor="register-email">
          Email
          <input
            autoCapitalize="none"
            autoComplete="email"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="register-email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>

        <label className="block text-sm font-black" htmlFor="register-password">
          Mật khẩu
          <input
            autoComplete="new-password"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="register-password"
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Tối thiểu 8 ký tự"
            required
            type="password"
            value={password}
          />
        </label>

        <p className="rounded-2xl bg-[#f4efe5] px-4 py-3 text-xs font-bold leading-5 text-[#68766f]">
          Tài khoản mới là học viên. Hãy dùng email bạn có thể mở để xác thực tài khoản trước khi học.
        </p>

        {error ? <p className="text-sm font-bold text-[#d6534d]" role="alert">{error}</p> : null}

        <button
          className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#18332d] text-sm font-black text-white disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? "Đang tạo…" : "Tạo tài khoản"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <p className="mt-5 text-center text-sm font-bold text-[#7b857f]">
        Đã có tài khoản? <Link href="/login" className="text-[#176b55]">Đăng nhập</Link>
      </p>
    </AccountPageShell>
  );
}
