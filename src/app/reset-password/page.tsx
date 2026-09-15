import { Suspense } from "react";
import { AccountPageShell } from "@/components/account-page-shell";
import ResetPasswordClient from "./reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AccountPageShell eyebrow="Đặt lại mật khẩu" title="Đang mở liên kết…">
          <p aria-live="polite" className="mt-7 text-sm font-bold text-[#68766f]" role="status">
            Đang chuẩn bị biểu mẫu đặt lại mật khẩu.
          </p>
        </AccountPageShell>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
