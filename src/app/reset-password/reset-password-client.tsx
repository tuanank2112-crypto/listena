"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
import { AccountPageShell } from "@/components/account-page-shell";

type ResetState = "form" | "success" | "invalid";

export default function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [state, setState] = useState<ResetState>(token ? "form" : "invalid");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Hai mật khẩu mới chưa giống nhau.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        passwordReset?: boolean;
      };

      if (response.ok && payload.passwordReset) {
        setPassword("");
        setConfirmation("");
        setState("success");
      } else if (payload.code === "TOKEN_INVALID") {
        setState("invalid");
      } else {
        setError(payload.error || "Chưa thể đặt lại mật khẩu. Vui lòng thử lại sau.");
      }
    } catch {
      setError("Chưa thể đặt lại mật khẩu. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  if (state === "success") {
    return (
      <AccountPageShell
        description="Mật khẩu mới đã được lưu. Hãy dùng mật khẩu này trong lần đăng nhập tiếp theo."
        eyebrow="Mật khẩu đã đổi"
        title="Bạn có thể đăng nhập lại."
      >
        <div className="mt-7 rounded-2xl bg-[#dff2e8] p-4 text-[#245340]">
          <CheckCircle2 className="h-7 w-7" />
          <p className="mt-3 text-sm font-bold">Liên kết này đã được dùng và không thể dùng lại.</p>
        </div>
        <Link
          className="mt-6 flex min-h-12 items-center justify-center rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"
          href="/login"
        >
          Đăng nhập
        </Link>
      </AccountPageShell>
    );
  }

  if (state === "invalid") {
    return (
      <AccountPageShell
        description="Liên kết này không còn sử dụng được. Liên kết đặt lại mật khẩu có thể đã hết hạn hoặc đã được dùng trước đó."
        eyebrow="Đặt lại mật khẩu"
        title="Liên kết không còn hiệu lực."
      >
        <div className="mt-7 rounded-2xl bg-[#fff1bd] p-4 text-[#805c15]" role="alert">
          <CircleAlert className="h-6 w-6" />
          <p className="mt-3 text-sm font-bold leading-6">Hãy yêu cầu một liên kết đặt lại mật khẩu mới để tiếp tục.</p>
        </div>
        <Link
          className="mt-6 flex min-h-12 items-center justify-center rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"
          href="/forgot-password"
        >
          Yêu cầu liên kết mới
        </Link>
      </AccountPageShell>
    );
  }

  return (
    <AccountPageShell
      description="Đặt mật khẩu mới cho tài khoản của bạn. Liên kết này chỉ dùng được một lần và có hiệu lực trong một giờ."
      eyebrow="Đặt lại mật khẩu"
      title="Chọn mật khẩu mới."
    >
      <form autoComplete="off" className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-black" htmlFor="reset-password">
          Mật khẩu mới
          <input
            autoComplete="off"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="reset-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Tối thiểu 8 ký tự"
            required
            type="password"
            value={password}
          />
        </label>
        <label className="block text-sm font-black" htmlFor="reset-password-confirmation">
          Nhập lại mật khẩu mới
          <input
            autoComplete="off"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="reset-password-confirmation"
            minLength={8}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="password"
            value={confirmation}
          />
        </label>
        {error ? <p className="text-sm font-bold text-[#d6534d]" role="alert">{error}</p> : null}
        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {loading ? "Đang lưu…" : "Lưu mật khẩu mới"}
        </button>
      </form>
    </AccountPageShell>
  );
}
