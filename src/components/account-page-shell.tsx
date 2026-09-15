import type { ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

type AccountPageShellProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
};

/**
 * Shared frame for account recovery and verification routes. It intentionally
 * contains no session or server data so public account pages can stay simple.
 */
export function AccountPageShell({
  eyebrow,
  title,
  description,
  children,
}: AccountPageShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-lg">
        <Link href="/" className="mb-8 inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#176b55] text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="font-black">ListenAI</span>
        </Link>

        <div className="paper-card rounded-[32px] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-[-.06em]">{title}</h1>
          {description ? (
            <p className="mt-3 text-sm font-bold leading-6 text-[#68766f]">{description}</p>
          ) : null}
          {children}
        </div>
      </section>
    </main>
  );
}
