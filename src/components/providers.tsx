"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import {
  registerEnglishFallbackSpeechEngine,
  registerEnglishSpeechEngine,
  registerVietnameseFallbackSpeechEngine,
  registerVietnameseSpeechEngine,
} from "@/core/tts/speech";
import { VieNeuSpeechEngine } from "@/core/tts/vie-engine";
import { WebSpeechEngine } from "@/core/tts/web-speech-engine";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const english = new WebSpeechEngine();
    const englishFallback = new WebSpeechEngine();
    const vietnamese = new VieNeuSpeechEngine();
    const vietnameseFallback = new WebSpeechEngine();

    registerEnglishSpeechEngine(english);
    registerEnglishFallbackSpeechEngine(null);
    registerVietnameseSpeechEngine(vietnamese);
    registerVietnameseFallbackSpeechEngine(vietnameseFallback);

    return () => {
      void english.stop();
      void englishFallback.stop();
      void vietnamese.stop();
      void vietnameseFallback.stop();
      registerEnglishSpeechEngine(null);
      registerEnglishFallbackSpeechEngine(null);
      registerVietnameseSpeechEngine(null);
      registerVietnameseFallbackSpeechEngine(null);
    };
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
