"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

type CredentialResult = {
  code?: string | null;
  error?: string | null;
  ok?: boolean;
};

function isEmailNotVerified(result: CredentialResult | undefined) {
  const code = result?.code ?? result?.error;
  return code === "email_not_verified" || code === "EMAIL_NOT_VERIFIED";
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedForVerification = searchParams.get("error") === "email_not_verified";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [error, setError] = useState(
    redirectedForVerification ? "Bạn cần xác thực email trước khi tiếp tục." : "",
  );
  const [verificationRequired, setVerificationRequired] = useState(redirectedForVerification);
  const [verificationMessage, setVerificationMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setVerificationRequired(false);
    setVerificationMessage("");

    try {
      const result = (await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      })) as CredentialResult | undefined;

      if (result?.error || !result?.ok) {
        if (isEmailNotVerified(result)) {
          setVerificationRequired(true);
          setError("Bạn cần xác thực email trước khi đăng nhập.");
        } else {
          setError("Email hoặc mật khẩu chưa đúng.");
        }
        return;
      }

      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await response.json()) as { user?: { role?: string } };
      const role = session.user?.role;
      router.push(role === "TEACHER" || role === "ADMIN" ? "/teacher/dashboard" : "/learner/dashboard");
      router.refresh();
    } catch {
      setError("Không thể đăng nhập lúc này. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setResendingVerification(true);
    setVerificationMessage("");
    try {
      const response = await fetch("/api/account/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        setVerificationMessage("Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
        return;
      }

      setVerificationMessage("Nếu địa chỉ này đủ điều kiện, email xác thực mới sẽ sớm đến hộp thư của bạn.");
    } catch {
      setVerificationMessage("Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
    } finally {
      setResendingVerification(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden paper-grid items-end bg-[#18332d] p-12 text-white lg:flex">
        <div className="max-w-md">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#f7d779]">Welcome back</p>
          <h2 className="mt-4 text-5xl font-black leading-none tracking-[-.06em]">
            Một bài nhỏ.
            <br />
            Một bước xa.
          </h2>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-[#ef765d]" />
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#176b55] text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="font-black">ListenAI</span>
          </Link>

          <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Sign in</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-.06em]">Tiếp tục học.</h1>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-black" htmlFor="login-email">
              Email
              <input
                autoCapitalize="none"
                autoComplete="email"
                className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-[#fffdf8] px-4 font-bold outline-none focus:border-[#176b55]"
                id="login-email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            <div>
              <div className="flex items-baseline justify-between gap-4">
                <label className="text-sm font-black" htmlFor="login-password">
                  Mật khẩu
                </label>
                <Link href="/forgot-password" className="text-xs font-black text-[#176b55] underline underline-offset-2">
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative mt-2">
                <input
                  autoComplete="current-password"
                  className="min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-[#fffdf8] px-4 pr-12 font-bold outline-none focus:border-[#176b55]"
                  id="login-password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Ẩn nội dung đã nhập" : "Hiện nội dung đã nhập"}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-[#879088]"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="text-sm font-bold text-[#d6534d]" role="alert">
                {error}
              </p>
            ) : null}

            {verificationRequired ? (
              <div className="rounded-2xl bg-[#f4efe5] px-4 py-3">
                <p className="text-sm font-bold leading-6 text-[#68766f]">
                  Hãy mở email xác thực đã gửi tới bạn. Bạn cũng có thể yêu cầu một email mới.
                </p>
                <button
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eee7da] px-3 text-xs font-black text-[#176b55] disabled:opacity-60"
                  disabled={resendingVerification || !email.trim()}
                  onClick={() => void resendVerification()}
                  type="button"
                >
                  {resendingVerification ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {resendingVerification ? "Đang gửi…" : "Gửi lại email xác thực"}
                </button>
                {verificationMessage ? (
                  <p aria-live="polite" className="mt-3 text-xs font-bold leading-5 text-[#68766f]" role="status">
                    {verificationMessage}
                  </p>
                ) : null}
              </div>
            ) : null}

            <button
              className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] text-sm font-black text-white disabled:opacity-50"
              disabled={loading}
              type="submit"
            >
              {loading ? "Đang vào…" : "Đăng nhập"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-bold text-[#7b857f]">
            Chưa có tài khoản? <Link href="/register" className="text-[#176b55]">Tạo mới</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <p className="text-sm font-bold text-[#68766f]">Đang mở trang đăng nhập…</p>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
