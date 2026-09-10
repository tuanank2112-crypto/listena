"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  registerEnglishFallbackSpeechEngine,
  registerEnglishSpeechEngine,
  registerVietnameseFallbackSpeechEngine,
  registerVietnameseSpeechEngine,
} from "@/core/tts/speech";
import { VieNeuSpeechEngine } from "@/core/tts/vie-engine";
import { WebSpeechEngine } from "@/core/tts/web-speech-engine";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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

  // SessionProvider eagerly requests /api/auth/session when it mounts. Auth.js
  // can set a double-submit CSRF cookie while serving that request, so mounting
  // it on a credentials form races with signIn() fetching its CSRF token.
  // These public entry pages do not consume useSession(); mount the provider
  // once the user moves into the app instead.
  if (pathname === "/login" || pathname === "/register") {
    return children;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
