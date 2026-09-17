"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { describeVoiceInputError, type RecognitionResult } from "@/core/voice/speech-recognition";
import { useVoiceInput } from "./use-voice-input";

interface VoiceInputButtonProps {
  onTranscript: (result: RecognitionResult) => void;
  disabled?: boolean;
  lang?: string;
  /** Visible label while idle. */
  label?: string;
  /** Compact icon-only variant for tight rows. */
  compact?: boolean;
  className?: string;
  /** Rendered when the browser has no recogniser; defaults to nothing. */
  unsupportedFallback?: React.ReactNode;
}

/**
 * Push-to-talk microphone (Plan14 SPEC-P142 §3). One tap starts a single
 * utterance capture; a second tap ends it early. Interim text and errors are
 * shown next to the button so the learner always knows what was heard.
 */
export function VoiceInputButton({
  onTranscript,
  disabled,
  lang = "en-US",
  label = "Nói để trả lời",
  compact = false,
  className = "",
  unsupportedFallback = null,
}: VoiceInputButtonProps) {
  const voice = useVoiceInput({ lang, onResult: onTranscript });
  if (!voice.supported) return <>{unsupportedFallback}</>;
  const listening = voice.status === "listening";

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`} data-voice-status={voice.status}>
      <button
        type="button"
        onClick={listening ? voice.stop : voice.start}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "Dừng thu âm" : label}
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black transition disabled:opacity-50 ${
          listening
            ? "bg-[#ef765d] text-white shadow-[0_0_0_6px_rgba(239,118,93,.18)]"
            : "bg-[#dff2e8] text-[#176b55] hover:bg-[#cdeadb]"
        }`}
      >
        {listening ? <Square className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
        {compact ? null : <span>{listening ? "Đang nghe... bấm để dừng" : label}</span>}
      </button>
      {listening && voice.interim && (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#748079]" aria-live="polite">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> {voice.interim}
        </span>
      )}
      {voice.status === "error" && voice.error && (
        <span role="alert" className="text-xs font-bold text-[#a33f3a]">{describeVoiceInputError(voice.error)}</span>
      )}
    </div>
  );
}
