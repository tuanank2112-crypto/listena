"use client";

import { useState } from "react";
import { LoaderCircle, RotateCcw, Volume2 } from "lucide-react";
import { speakCurated } from "@/core/tts/speech";
import type { PronunciationResult, PronunciationWordStatus } from "@/core/voice/pronunciation";
import type { RecognitionResult } from "@/core/voice/speech-recognition";
import { RECAST_RATE } from "@/core/voice/voice-script";
import { makeClientUuid } from "@/features/learning-session/client-id";
import { VoiceInputButton } from "./voice-input-button";
import { useVoicePreferences } from "./voice-preferences";

interface RepeatAfterMeProps {
  /** A server-curated English line (NPC or RECAST). */
  line: string;
  /** When given, the score is recorded on the session ledger. */
  sessionId?: string;
  lang?: string;
}

type PracticePhase = "idle" | "scoring" | "scored" | "failed";

const WORD_STYLES: Record<PronunciationWordStatus, string> = {
  MATCH: "bg-[#dff2e8] text-[#176b55]",
  CLOSE: "bg-[#fff2bf] text-[#765b16]",
  MISSED: "bg-[#ffe5dc] text-[#a33f3a]",
  EXTRA: "bg-[#eee7da] text-[#8a918d] line-through",
};

const VERDICT_LABELS: Record<PronunciationResult["verdict"], string> = {
  GOOD: "Rõ ràng",
  ALMOST: "Gần đúng",
  RETRY: "Thử lại",
};

interface PronunciationResponse {
  result?: PronunciationResult;
  recorded?: boolean;
  error?: string;
  code?: string;
}

/**
 * "Nghe mẫu, nói lại" card (Plan14 SPEC-P142 §4). The model line is spoken
 * slowly with the curated voice; the learner's attempt is transcribed in the
 * browser and graded on the server. Only server-curated lines are offered, so
 * the learner never practises an erroneous sentence.
 */
export function RepeatAfterMe({ line, sessionId, lang = "en-US" }: RepeatAfterMeProps) {
  const preferences = useVoicePreferences();
  const [phase, setPhase] = useState<PracticePhase>("idle");
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [error, setError] = useState("");

  async function grade(recognition: RecognitionResult) {
    setPhase("scoring");
    setHeard(recognition.transcript);
    setError("");
    try {
      const response = await fetch("/api/voice/pronunciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientAttemptId: makeClientUuid(),
          expected: line,
          transcript: recognition.transcript,
          ...(recognition.confidence !== null ? { recognitionConfidence: recognition.confidence } : {}),
          ...(sessionId ? { sessionId } : {}),
        }),
      });
      const payload = (await response.json()) as PronunciationResponse;
      if (!response.ok || !payload.result) throw new Error(payload.error || "Chưa chấm được phát âm.");
      setResult(payload.result);
      setPhase("scored");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa chấm được phát âm.");
      setPhase("failed");
    }
  }

  return (
    <div className="rounded-2xl border border-[#ded8cc] bg-[#fffdf8] p-3" data-repeat-line={line}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void speakCurated({ text: line, lang: "en", rate: RECAST_RATE * preferences.rate })}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#18332d] px-3 text-xs font-black text-white"
        >
          <Volume2 className="h-4 w-4 text-[#f7d779]" /> Nghe mẫu
        </button>
        <VoiceInputButton lang={lang} label="Nói lại" onTranscript={(recognition) => void grade(recognition)} disabled={phase === "scoring"} />
        {phase === "scoring" && <LoaderCircle className="h-4 w-4 animate-spin text-[#748079]" aria-label="Đang chấm" />}
      </div>
      <p className="mt-2 text-sm font-black leading-6 text-[#18332d]">{line}</p>

      {phase === "failed" && <p role="alert" className="mt-2 text-xs font-bold text-[#a33f3a]">{error}</p>}

      {phase === "scored" && result && (
        <div className="mt-3 space-y-2" data-pronunciation-verdict={result.verdict}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            <span className={`rounded-lg px-2 py-1 ${result.verdict === "GOOD" ? "bg-[#dff2e8] text-[#176b55]" : result.verdict === "ALMOST" ? "bg-[#fff2bf] text-[#765b16]" : "bg-[#ffe5dc] text-[#a33f3a]"}`}>
              {VERDICT_LABELS[result.verdict]} · {Math.round(result.score * 100)}%
            </span>
            {heard && <span className="text-[#748079]">Máy nghe: “{heard}”</span>}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Từng từ">
            {result.words.map((word, index) => (
              <span key={`${word.expected ?? word.heard}-${index}`} className={`rounded-lg px-2 py-1 text-xs font-black ${WORD_STYLES[word.status]}`} title={word.heard ? `Nghe: ${word.heard}` : "Không nghe thấy"}>
                {word.expected ?? word.heard}
              </span>
            ))}
          </div>
          <p className="text-xs font-bold leading-5 text-[#65746c]">{result.feedbackVi}</p>
          {result.verdict !== "GOOD" && (
            <button type="button" onClick={() => { setPhase("idle"); setResult(null); }} className="inline-flex min-h-9 items-center gap-1 text-xs font-black text-[#176b55]">
              <RotateCcw className="h-3.5 w-3.5" /> Thử lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
