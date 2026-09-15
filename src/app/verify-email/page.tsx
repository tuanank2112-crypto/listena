import { Suspense } from "react";
import { AccountPageShell } from "@/components/account-page-shell";
import VerifyEmailClient from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AccountPageShell eyebrow="Xác thực email" title="Đang mở liên kết…">
          <p aria-live="polite" className="mt-7 text-sm font-bold text-[#68766f]" role="status">
            Đang kiểm tra liên kết xác thực của bạn.
          </p>
        </AccountPageShell>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  );
}
