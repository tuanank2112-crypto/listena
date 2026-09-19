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
import { CompositeSpeechEngine } from "@/core/tts/composite-engine";
import { ElevenLabsSpeechEngine } from "@/core/tts/elevenlabs-engine";
import { VieNeuSpeechEngine } from "@/core/tts/vie-engine";
import { WebSpeechEngine } from "@/core/tts/web-speech-engine";
import type { EnglishAccent } from "@/core/voice/voice-policy";
import { loadVoiceCapabilities } from "@/features/voice/voice-capabilities";
import { getVoicePreferences } from "@/features/voice/voice-preferences";

const PUBLIC_ENTRY_PATHS = new Set(["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"]);

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicEntry = PUBLIC_ENTRY_PATHS.has(pathname ?? "");

  useEffect(() => {
    // The accent is read on every utterance so the settings panel applies
    // immediately; the curated voice policy decides the actual voice (Plan14).
    const getAccent = () => getVoicePreferences().accent;
    // Plan15: the AI voice (ElevenLabs, server-side) leads when the server
    // offers it and the learner has not forced browser voices; the browser
    // voice is always the fallback so nothing is ever silent.
    const isAiVoiceAvailable = async () => {
      if (getVoicePreferences().engine === "browser") return false;
      return (await loadVoiceCapabilities()).aiVoice;
    };
    const getVoiceId = (key: "en-US" | "en-GB" | "vi") => getVoicePreferences().aiVoices[key];
    // Plan18: the learner may pin a browser voice per accent; it overrides the
    // curated policy for the English browser engine only.
    const getPreferredVoiceURI = (accent: EnglishAccent) => getVoicePreferences().browserVoices[accent];
    const aiEnglish = new ElevenLabsSpeechEngine({ isAvailable: isAiVoiceAvailable, getAccent, getVoiceId });
    const aiVietnamese = new ElevenLabsSpeechEngine({ isAvailable: isAiVoiceAvailable, getAccent, getVoiceId });
    const english = new WebSpeechEngine({ getAccent, getPreferredVoiceURI });
    const vietnamese = new CompositeSpeechEngine([aiVietnamese, new VieNeuSpeechEngine()]);
    const vietnameseFallback = new WebSpeechEngine();

    registerEnglishSpeechEngine(aiEnglish);
    registerEnglishFallbackSpeechEngine(english);
    registerVietnameseSpeechEngine(vietnamese);
    registerVietnameseFallbackSpeechEngine(vietnameseFallback);

    return () => {
      void aiEnglish.stop();
      void english.stop();
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
  if (isPublicEntry) {
    return children;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
