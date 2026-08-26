"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { KokoroSpeechEngine } from "@/core/tts/kokoro-client";
import { registerEnglishSpeechEngine, registerVietnameseSpeechEngine } from "@/core/tts/speech";
import { VieNeuSpeechEngine } from "@/core/tts/vie-engine";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const english = new KokoroSpeechEngine();
    const vietnamese = new VieNeuSpeechEngine();
    registerEnglishSpeechEngine(english);
    registerVietnameseSpeechEngine(vietnamese);
    return () => {
      registerEnglishSpeechEngine(null);
      registerVietnameseSpeechEngine(null);
    };
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}
