"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, LoaderCircle } from "lucide-react";
import { AccountPageShell } from "@/components/account-page-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/account/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (response.ok) {
        setSent(true);
      } else if (response.status === 400) {
        setError("Hãy nhập một địa chỉ email hợp lệ.");
      } else {
        setError("Email đặt lại mật khẩu đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
      }
    } catch {
      setError("Email đặt lại mật khẩu đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountPageShell
      description="Nhập email của bạn. Vì an toàn, màn hình này luôn cho cùng một kết quả với mọi địa chỉ hợp lệ."
      eyebrow="Khôi phục tài khoản"
      title="Quên mật khẩu?"
    >
      {sent ? (
        <div className="mt-7 rounded-2xl bg-[#dff2e8] p-4 text-[#245340]" role="status">
          <KeyRound className="h-6 w-6" />
          <p className="mt-3 text-sm font-black">Hãy kiểm tra hộp thư của bạn.</p>
          <p className="mt-1 text-sm font-bold leading-6">
            Nếu địa chỉ này đủ điều kiện, chúng tôi sẽ gửi liên kết đặt lại mật khẩu. Liên kết có hiệu lực trong một giờ.
          </p>
          <Link className="mt-5 inline-flex text-sm font-black text-[#176b55] underline underline-offset-2" href="/login">
            Quay về đăng nhập
          </Link>
        </div>
      ) : (
        <form autoComplete="off" className="mt-7" onSubmit={submit}>
          <label className="block text-sm font-black" htmlFor="forgot-password-email">
            Email
            <input
              autoCapitalize="none"
              autoComplete="email"
              className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
              id="forgot-password-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>
          {error ? <p className="mt-3 text-sm font-bold text-[#d6534d]" role="alert">{error}</p> : null}
          <button
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {loading ? "Đang gửi…" : "Gửi liên kết đặt lại"}
          </button>
        </form>
      )}

      {!sent ? (
        <p className="mt-5 text-center text-sm font-bold text-[#7b857f]">
          <Link href="/login" className="text-[#176b55]">Quay về đăng nhập</Link>
        </p>
      ) : null}
    </AccountPageShell>
  );
}
