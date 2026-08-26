"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { KokoroSpeechEngine } from "@/core/tts/kokoro-client";
import { registerEnglishSpeechEngine } from "@/core/tts/speech";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const engine = new KokoroSpeechEngine();
    registerEnglishSpeechEngine(engine);
    return () => registerEnglishSpeechEngine(null);
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}
