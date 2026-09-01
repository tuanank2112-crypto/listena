"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, Sparkles } from "lucide-react";
import type { LearningSessionMode, PublicLearningSession } from "./types";

interface StartSessionButtonProps {
  lessonId?: string;
  mode?: LearningSessionMode;
  goal?: string;
  scenarioKey?: string;
  label?: string;
  className?: string;
}

export function StartSessionButton({
  lessonId,
  mode = "LESSON_COACH",
  goal,
  scenarioKey,
  label = "Học cùng AI",
  className = "",
}: StartSessionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/learning-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, mode, goal, scenarioKey }),
      });
      const payload = (await response.json()) as { session?: PublicLearningSession; error?: string };
      if (!response.ok || !payload.session?.id) throw new Error(payload.error || "Chưa thể mở phiên AI.");
      router.push(`/learner/session/${payload.session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa thể mở phiên AI.");
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ef765d] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(239,118,93,.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
        {loading ? "Đang dựng tình huống..." : label}
        {!loading && <Sparkles className="h-3.5 w-3.5 text-[#f7d779]" />}
      </button>
      {error && <p className="mt-2 max-w-xs text-xs font-bold text-[#c74f47]" role="alert">{error}</p>}
    </div>
  );
}
