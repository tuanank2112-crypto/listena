"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BrainCircuit, CircleAlert, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { PendingPersonalizedLesson } from "@/server/personalized-learning/service";

/** Plan13 SPEC-P131 §4: poll every 3s, give up after the 210s generation lease. */
export const PERSONALIZED_POLL_INTERVAL_MS = 3_000;
export const PERSONALIZED_POLL_DEADLINE_MS = 210_000;

const STEPS = [
  { at: 0, label: "Đang đọc hồ sơ học tập của bạn" },
  { at: 5_000, label: "Đang soạn bài theo mức của bạn" },
  { at: 40_000, label: "Đang kiểm tra đáp án và từ vựng" },
] as const;

/** Pure: which progress step applies after `elapsedMs` (exported for tests). */
export function progressStepIndex(elapsedMs: number) {
  let index = 0;
  for (let i = 0; i < STEPS.length; i += 1) {
    if (elapsedMs >= STEPS[i]!.at) index = i;
  }
  return index;
}

type StatusPayload = {
  lesson?: { id: string; status: "READY" | "GENERATING" | "FAILED"; failureCode?: string | null };
  error?: string;
  retryAfterSeconds?: number;
};

const failureMessages: Record<string, string> = {
  AI_MISCONFIGURED: "Gia sư AI chưa được cấu hình đúng. Vui lòng báo quản trị viên; thử lại ngay sẽ không khắc phục được.",
  AI_RATE_LIMITED: "Gia sư AI đang nhận quá nhiều yêu cầu. Hãy thử lại sau ít phút.",
  AI_REQUEST_LIMIT: "Bạn vừa dùng một lượt AI. Hãy chờ một chút rồi thử lại.",
  GENERATION_TIMEOUT: "Việc tạo bài kéo dài quá lâu và đã bị dừng. Bạn có thể thử lại.",
};

export function PersonalizedLessonProgress({ initial }: { initial: PendingPersonalizedLesson }) {
  const router = useRouter();
  const [status, setStatus] = useState<"GENERATING" | "FAILED" | "TIMEOUT">(initial.status);
  const [failureCode, setFailureCode] = useState<string | null>(initial.failureCode);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  // Set inside the effect: reading the clock during render is impure.
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "GENERATING") return;
    let cancelled = false;
    const controller = new AbortController();
    startedAtRef.current ??= Date.now();
    const startedAt = startedAtRef.current;

    async function poll() {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= PERSONALIZED_POLL_DEADLINE_MS) {
        setStatus("TIMEOUT");
        return;
      }
      try {
        const response = await fetch(`/api/learner/personalized-lessons/${initial.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as StatusPayload;
        if (cancelled) return;
        if (response.ok && payload.lesson?.status === "READY") {
          router.refresh();
          return;
        }
        if (response.ok && payload.lesson?.status === "FAILED") {
          setFailureCode(payload.lesson.failureCode ?? null);
          setStatus("FAILED");
          return;
        }
        if (!response.ok && response.status === 404) {
          setError(payload.error || "Không tìm thấy bài học này.");
          setStatus("FAILED");
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        // Transient network trouble: keep polling until the deadline.
      }
      globalThis.setTimeout(() => void poll(), PERSONALIZED_POLL_INTERVAL_MS);
    }

    const ticker = globalThis.setInterval(() => setElapsedMs(Date.now() - startedAt), 1_000);
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      globalThis.clearInterval(ticker);
    };
  }, [initial.id, router, status]);

  const retry = useCallback(async () => {
    setRetrying(true);
    setError("");
    try {
      const response = await fetch("/api/learner/personalized-lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSkill: initial.targetSkill }),
      });
      const payload = (await response.json()) as StatusPayload;
      if (!response.ok || !payload.lesson) {
        const retryHint = payload.retryAfterSeconds ? ` Thử lại sau ${payload.retryAfterSeconds} giây.` : "";
        throw new Error(`${payload.error || "Chưa thể tạo lại bài học."}${retryHint}`);
      }
      if (payload.lesson.id !== initial.id) {
        router.push(`/learner/personalized-lessons/${payload.lesson.id}`);
        return;
      }
      if (payload.lesson.status === "READY") {
        router.refresh();
        return;
      }
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setFailureCode(null);
      setStatus("GENERATING");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa thể tạo lại bài học.");
    } finally {
      setRetrying(false);
    }
  }, [initial.id, initial.targetSkill, router]);

  const step = progressStepIndex(elapsedMs);
  const failed = status === "FAILED" || status === "TIMEOUT";
  const failureMessage = status === "TIMEOUT"
    ? failureMessages.GENERATION_TIMEOUT
    : (failureCode && failureMessages[failureCode]) || "AI chưa tạo được bài lần này. Bạn có thể thử lại.";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-8">
      <section className="paper-card w-full rounded-[32px] p-7 sm:p-9" aria-live="polite">
        <Link href="/learner/personalized-lessons" className="inline-flex h-10 items-center gap-2 text-xs font-black text-[#176b55]">
          <ArrowLeft className="h-4 w-4" /> Bài AI của tôi
        </Link>
        <span className={`mt-5 flex h-14 w-14 items-center justify-center rounded-2xl ${failed ? "bg-[#ffe5dc] text-[#d6534d]" : "bg-[#18332d] text-[#f7d779]"}`}>
          {failed ? <CircleAlert className="h-7 w-7" /> : <BrainCircuit className="h-7 w-7 animate-pulse" />}
        </span>
        {failed ? (
          <>
            <p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-[#d6534d]">Chưa tạo được</p>
            <h1 className="mt-2 text-2xl font-black tracking-[-.04em] sm:text-3xl">Bài AI riêng chưa sẵn sàng.</h1>
            <p className="mt-3 text-sm font-bold leading-6 text-[#65746c]">{error || failureMessage}</p>
            {failureCode !== "AI_MISCONFIGURED" && (
              <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
                className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white disabled:opacity-50"
              >
                {retrying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Thử lại
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">AI đang tạo bài riêng</p>
            <h1 className="mt-2 text-2xl font-black tracking-[-.04em] sm:text-3xl">Bài học của bạn đang được soạn.</h1>
            <p className="mt-3 text-sm font-bold leading-6 text-[#65746c]">Thường mất 10-30 giây. Bạn có thể giữ trang này mở; bài sẽ tự hiện khi sẵn sàng.</p>
            <ol className="mt-6 space-y-3">
              {STEPS.map((item, index) => {
                const done = index < step;
                const active = index === step;
                return (
                  <li key={item.label} className={`flex items-center gap-3 text-sm font-black ${active ? "text-[#176b55]" : done ? "text-[#748079]" : "text-[#b0b1aa]"}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#176b55] text-white" : done ? "bg-[#dff2e8] text-[#176b55]" : "bg-[#eee7da]"}`}>
                      {active ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : done ? <Sparkles className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {item.label}
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 text-xs font-bold text-[#9aa39d]">Đã chờ {Math.floor(elapsedMs / 1_000)} giây · lần thử {initial.generationAttempt || 1}</p>
          </>
        )}
      </section>
    </div>
  );
}
