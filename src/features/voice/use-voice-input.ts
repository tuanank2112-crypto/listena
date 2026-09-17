"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createBrowserRecognizer,
  isSpeechRecognitionSupported,
  VoiceInputError,
  type RecognitionResult,
  type VoiceInputErrorCode,
} from "@/core/voice/speech-recognition";
import { stopSpeech } from "@/core/tts/speech";

export type VoiceInputStatus = "unsupported" | "idle" | "listening" | "error";

export interface UseVoiceInputOptions {
  lang?: string;
  onResult: (result: RecognitionResult) => void;
  maxDurationMs?: number;
}

export interface VoiceInputState {
  status: VoiceInputStatus;
  supported: boolean;
  interim: string;
  error: VoiceInputErrorCode | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

const noSubscription = () => () => {};
/** Server render assumes no recogniser so the markup matches Firefox and hydration stays stable. */
const serverSupport = () => false;

/**
 * One-shot voice capture for a reply or a repeat-after-me attempt
 * (Plan14 SPEC-P142 §3). Starting capture stops any playing voice first so the
 * recogniser does not transcribe the AI's own speech.
 */
export function useVoiceInput({ lang = "en-US", onResult, maxDurationMs }: UseVoiceInputOptions): VoiceInputState {
  const supported = useSyncExternalStore(noSubscription, isSpeechRecognitionSupported, serverSupport);
  const [phase, setPhase] = useState<"idle" | "listening" | "error">("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<VoiceInputErrorCode | null>(null);
  const recognizer = useMemo(() => (supported ? createBrowserRecognizer() : null), [supported]);
  const controllerRef = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!recognizer || phase === "listening") return;
    void stopSpeech();
    const controller = new AbortController();
    controllerRef.current = controller;
    setInterim("");
    setError(null);
    setPhase("listening");
    recognizer
      .start({ lang, signal: controller.signal, maxDurationMs, onInterim: setInterim })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPhase("idle");
        setInterim("");
        onResultRef.current(result);
      })
      .catch((caught: unknown) => {
        setInterim("");
        if (controller.signal.aborted) {
          setPhase("idle");
          return;
        }
        setError(caught instanceof VoiceInputError ? caught.code : "failed");
        setPhase("error");
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  }, [lang, maxDurationMs, phase, recognizer]);

  const stop = useCallback(() => recognizer?.stop(), [recognizer]);
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setPhase("idle");
    setInterim("");
  }, []);

  return { status: supported ? phase : "unsupported", supported, interim, error, start, stop, cancel };
}
