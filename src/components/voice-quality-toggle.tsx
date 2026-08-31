"use client";

import { useEffect, useState } from "react";
import { Activity, AudioLines, Sparkles } from "lucide-react";

export function VoiceQualityToggle() {
  const [quality, setQuality] = useState<"fast" | "high">("fast");
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    const initializeClientState = () => {
      setSpeechSupported(Boolean(window.speechSynthesis));
      const stored = window.localStorage.getItem("listenai.tts.quality");
      if (stored === "fast" || stored === "high") setQuality(stored);
    };
    if (typeof window !== "undefined") {
      initializeClientState();
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("listenai.tts.quality", quality);
  }, [quality]);

  if (!speechSupported) return null;

  return (
    <div className="inline-flex rounded-2xl bg-[#eee7da] p-1">
      <button
        type="button"
        onClick={() => setQuality("fast")}
        className={`flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-black transition ${quality === "fast" ? "bg-[#176b55] text-white" : "text-[#68766f]"}`}
        title="Phát âm tức thì bằng giọng hệ thống miễn phí"
      >
        <Activity className="h-4 w-4" /> Nhanh
      </button>
      <button
        type="button"
        onClick={() => setQuality("high")}
        className={`flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-black transition ${quality === "high" ? "bg-[#176b55] text-white" : "text-[#68766f]"}`}
        title="Ưu tiên giọng Natural/Premium/Enhanced miễn phí có sẵn"
      >
        <AudioLines className="h-4 w-4" /> Chất lượng cao
      </button>
      <Sparkles className="mx-2 h-4 w-4 self-center text-[#d89a2b]" />
    </div>
  );
}
