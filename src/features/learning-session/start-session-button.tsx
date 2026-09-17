"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, Sparkles } from "lucide-react";
import type { LearningSessionMode } from "./types";
import { makeClientStartId } from "./client-id";
import {
  offersActiveSessionChoice,
  shouldDiscardSessionStartId,
} from "./start-contract";
import { requestSessionStart, SessionStartRequestError } from "./start-request";

interface StartSessionButtonProps {
  lessonId?: string;
  mode?: LearningSessionMode;
  goal?: string;
  scenarioKey?: string;
  label?: string;
  className?: string;
  /** Reload a client-owned decision after its target disappears server-side. */
  onTargetUnavailable?: () => void;
}

export function StartSessionButton({
  lessonId,
  mode = "LESSON_COACH",
  goal,
  scenarioKey,
  label = "Học cùng AI",
  className = "",
  onTargetUnavailable,
}: StartSessionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const startIdRef = useRef<string | null>(null);
  const startControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => startControllerRef.current?.abort(), []);

  async function start(options: { forceNewRequest?: boolean; replaceActive?: boolean } = {}) {
    if (loading || startControllerRef.current) return;
    if (options.forceNewRequest || options.replaceActive) startIdRef.current = null;
    setLoading(true);
    setError("");
    setErrorCode(null);
    setActiveSessionId(null);
    const clientStartId = startIdRef.current ?? makeClientStartId();
    startIdRef.current = clientStartId;
    const controller = new AbortController();
    startControllerRef.current = controller;
    try {
      const session = await requestSessionStart({
        clientStartId,
        lessonId,
        mode,
        goal,
        scenarioKey,
        ...(options.replaceActive ? { replaceActive: true } : {}),
      }, { signal: controller.signal });
      startIdRef.current = null;
      router.push(`/learner/session/${session.id}`);
    } catch (caught) {
      if (controller.signal.aborted) return;
      const code = caught instanceof SessionStartRequestError ? caught.code : undefined;
      const conflictSessionId = caught instanceof SessionStartRequestError ? caught.activeSessionId : undefined;
      const retryAfterSeconds = caught instanceof SessionStartRequestError ? caught.retryAfterSeconds : undefined;
      if (shouldDiscardSessionStartId(code)) startIdRef.current = null;
      if (code === "TARGET_UNAVAILABLE") {
        router.refresh();
        onTargetUnavailable?.();
      }
      setErrorCode(code ?? null);
      setActiveSessionId(offersActiveSessionChoice({ code, activeSessionId: conflictSessionId }) ? conflictSessionId! : null);
      setError(
        code === "TARGET_UNAVAILABLE"
          ? "Mục tiêu này vừa không còn khả dụng. Danh sách nhiệm vụ đã được làm mới."
          : code === "ACTIVE_SESSION_EXISTS"
            ? "Bạn đang có một phiên chưa hoàn tất. Tiếp tục phiên đó, hoặc bắt đầu phiên mới (phiên cũ sẽ được đóng lại)."
            : `${caught instanceof Error ? caught.message : "Chưa thể mở phiên AI."}${retryAfterSeconds ? ` Thử lại sau ${retryAfterSeconds} giây.` : ""}`,
      );
    } finally {
      if (startControllerRef.current === controller) {
        startControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={loading}
        className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ef765d] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(239,118,93,.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
        {loading ? "Đang dựng tình huống..." : label}
        {!loading && <Sparkles className="h-3.5 w-3.5 text-[#f7d779]" />}
      </button>
      {error && <p className="mt-2 max-w-xs text-xs font-bold text-[#c74f47]" role="alert">{error}</p>}
      {errorCode === "START_OUTCOME_UNKNOWN" && (
        <button
          type="button"
          onClick={() => void start({ forceNewRequest: true })}
          className="mt-2 text-left text-xs font-black text-[#8c5b16] underline underline-offset-2"
        >
          Bắt đầu một phiên mới (yêu cầu trước có thể đã được AI xử lý)
        </button>
      )}
      {errorCode === "ACTIVE_SESSION_EXISTS" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={activeSessionId ? `/learner/session/${activeSessionId}` : "/learner/dashboard"}
            className="inline-flex min-h-10 items-center rounded-xl bg-[#dff2e8] px-3 text-xs font-black text-[#176b55]"
          >
            Tiếp tục phiên đang mở
          </Link>
          {activeSessionId && (
            <button
              type="button"
              onClick={() => void start({ replaceActive: true })}
              disabled={loading}
              className="inline-flex min-h-10 items-center rounded-xl border-2 border-[#ef765d] px-3 text-xs font-black text-[#c74f47] disabled:opacity-50"
            >
              Bắt đầu phiên mới
            </button>
          )}
        </div>
      )}
    </div>
  );
}
