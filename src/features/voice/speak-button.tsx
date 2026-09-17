"use client";

import { Volume2 } from "lucide-react";
import { speakCurated } from "@/core/tts/speech";
import { useVoicePreferences } from "./voice-preferences";

interface SpeakButtonProps {
  text: string;
  lang?: "en" | "vi";
  label?: string;
  className?: string;
  /** Icon-only variant. */
  compact?: boolean;
}

/** A "listen" button for visible text; always goes through the curated pipeline. */
export function SpeakButton({ text, lang = "en", label = "Nghe", className = "", compact = false }: SpeakButtonProps) {
  const preferences = useVoicePreferences();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => { event.stopPropagation(); void speakCurated({ text, lang, rate: preferences.rate }); }}
      className={compact
        ? `inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#18332d] text-[#f7d779] ${className}`
        : `inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#18332d] px-3 text-xs font-black text-white ${className}`}
    >
      <Volume2 className="h-4 w-4" />
      {!compact && <span>{label}</span>}
    </button>
  );
}
