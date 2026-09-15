"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { AccountPageShell } from "@/components/account-page-shell";

type VerificationState = "checking" | "verified" | "invalid" | "unavailable";

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const submittedToken = useRef<string | null>(null);
  const [state, setState] = useState<VerificationState>(token ? "checking" : "invalid");
  const [email, setEmail] = useState("");
  const [requestingLink, setRequestingLink] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");

  const confirmToken = useCallback(async () => {
    if (!token) {
      setState("invalid");
      return;
    }

    setState("checking");
    try {
      const response = await fetch("/api/account/verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => ({}))) as { code?: string; verified?: boolean };

      if (response.ok && payload.verified) {
        setState("verified");
      } else if (payload.code === "TOKEN_INVALID" || response.status === 400) {
        setState("invalid");
      } else {
        setState("unavailable");
      }
    } catch {
      setState("unavailable");
    }
  }, [token]);

  useEffect(() => {
    if (submittedToken.current === token) return;
    submittedToken.current = token;
    void confirmToken();
  }, [confirmToken, token]);

  async function requestNewLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestingLink(true);
    setRequestMessage("");

    try {
      const response = await fetch("/api/account/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      setRequestMessage(
        response.ok
          ? "Nếu địa chỉ này đủ điều kiện, email xác thực mới sẽ sớm đến hộp thư của bạn."
          : "Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.",
      );
    } catch {
      setRequestMessage("Email xác thực đang tạm thời chưa gửi được. Vui lòng thử lại sau.");
    } finally {
      setRequestingLink(false);
    }
  }

  if (state === "checking") {
    return (
      <AccountPageShell eyebrow="Xác thực email" title="Đang xác thực…">
        <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[#f4efe5] p-4 text-sm font-bold text-[#68766f]" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#176b55]" />
          Liên kết này chỉ được sử dụng một lần.
        </div>
      </AccountPageShell>
    );
  }

  if (state === "verified") {
    return (
      <AccountPageShell
        description="Email của bạn đã được xác thực. Bây giờ bạn có thể đăng nhập để tiếp tục học."
        eyebrow="Xác thực hoàn tất"
        title="Tài khoản đã sẵn sàng."
      >
        <div className="mt-7 rounded-2xl bg-[#dff2e8] p-4 text-[#245340]">
          <CheckCircle2 className="h-7 w-7" />
          <p className="mt-3 text-sm font-black">Bạn đã chứng minh quyền sở hữu email này.</p>
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

  const isUnavailable = state === "unavailable";
  return (
    <AccountPageShell
      description={
        isUnavailable
          ? "Chúng tôi chưa thể kiểm tra liên kết lúc này. Bạn có thể thử lại hoặc yêu cầu email xác thực mới."
          : "Liên kết này không còn sử dụng được. Liên kết có thể đã hết hạn hoặc đã được dùng trước đó."
      }
      eyebrow="Xác thực email"
      title={isUnavailable ? "Chưa thể xác thực." : "Liên kết không còn hiệu lực."}
    >
      <div className="mt-7 rounded-2xl bg-[#fff1bd] p-4 text-[#805c15]" role="alert">
        <CircleAlert className="h-6 w-6" />
        <p className="mt-3 text-sm font-bold leading-6">
          {isUnavailable ? "Không có thay đổi nào được thực hiện với tài khoản của bạn." : "Hãy yêu cầu một email xác thực mới để tiếp tục."}
        </p>
      </div>

      {isUnavailable ? (
        <button
          className="mt-5 flex min-h-11 items-center gap-2 rounded-2xl bg-[#eee7da] px-4 text-sm font-black text-[#176b55]"
          onClick={() => void confirmToken()}
          type="button"
        >
          <RefreshCw className="h-4 w-4" /> Thử lại liên kết này
        </button>
      ) : null}

      <form autoComplete="off" className="mt-6 border-t border-[#ded8cc] pt-6" onSubmit={requestNewLink}>
        <label className="block text-sm font-black" htmlFor="verification-email">
          Email nhận liên kết mới
          <input
            autoCapitalize="none"
            autoComplete="email"
            className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 font-bold outline-none focus:border-[#176b55]"
            id="verification-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <button
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-50"
          disabled={requestingLink}
          type="submit"
        >
          {requestingLink ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {requestingLink ? "Đang gửi…" : "Gửi email xác thực mới"}
        </button>
        {requestMessage ? (
          <p aria-live="polite" className="mt-3 text-sm font-bold leading-6 text-[#68766f]" role="status">
            {requestMessage}
          </p>
        ) : null}
      </form>

      <p className="mt-5 text-center text-sm font-bold text-[#7b857f]">
        <Link href="/login" className="text-[#176b55]">Quay về đăng nhập</Link>
      </p>
    </AccountPageShell>
  );
}
