"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import { stopSpeech } from "@/core/tts/speech";
import { useVoicePreferences } from "./voice-preferences";

interface HiddenAudioButtonProps {
  /** Server route that returns audio for text the client must not see. */
  src: string;
  /** Optional pre-built audio file; tried before the server voice. */
  fallbackUrl?: string | null;
  /** Play once automatically when the source changes (after a user gesture on the page). */
  autoPlay?: boolean;
  size?: "large" | "small";
  label?: string;
  onError?: (message: string) => void;
  /**
   * Playback speed, applied to the audio element. The bytes are unchanged, so
   * slowing a word down costs no extra request and still never reveals the
   * hidden text. Browsers preserve pitch, so 0.75x stays a voice rather than a
   * growl.
   */
  rate?: number;
}

/**
 * Plays audio whose text lives only on the server (a hidden spelling answer):
 * Plan15 SPEC-P151. The button fetches the audio route with the learner's
 * accent, caches the blob for replays, and reports a friendly message when
 * the AI voice is not configured (503) so the caller can show a fallback.
 */
export function HiddenAudioButton({ src, fallbackUrl, autoPlay = false, size = "large", label = "Nghe từ", onError, rate = 1 }: HiddenAudioButtonProps) {
  const preferences = useVoicePreferences();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "unavailable">("idle");
  const blobRef = useRef<{ key: string; url: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = `${src}${src.includes("?") ? "&" : "?"}accent=${encodeURIComponent(preferences.accent)}`;

  const play = useCallback(async () => {
    await stopSpeech();
    audioRef.current?.pause();
    setState("loading");
    try {
      let objectUrl = blobRef.current?.key === url ? blobRef.current.url : null;
      if (!objectUrl) {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          if (fallbackUrl) {
            objectUrl = fallbackUrl;
          } else {
            setState("unavailable");
            onError?.(response.status === 503
              ? "Giọng AI chưa được cấu hình cho lượt này. Bạn vẫn có thể luyện chính tả theo gợi ý nghĩa."
              : "Chưa tải được âm thanh của lượt này.");
            return;
          }
        } else {
          const blob = await response.blob();
          if (blobRef.current) URL.revokeObjectURL(blobRef.current.url);
          objectUrl = URL.createObjectURL(blob);
          blobRef.current = { key: url, url: objectUrl };
        }
      }
      const audio = new Audio(objectUrl);
      audio.playbackRate = rate;
      audioRef.current = audio;
      audio.onplay = () => setState("playing");
      audio.onended = () => setState("idle");
      audio.onerror = () => { setState("idle"); onError?.("Thiết bị không phát được âm thanh của lượt này."); };
      await audio.play();
    } catch {
      setState("idle");
      onError?.("Thiết bị không phát được âm thanh của lượt này.");
    }
  }, [fallbackUrl, onError, rate, url]);

  useEffect(() => {
    if (!autoPlay) return;
    // Deferred so the effect only schedules playback; state changes happen in
    // the playback callback, after the round has rendered.
    const timer = window.setTimeout(() => void play(), 0);
    return () => window.clearTimeout(timer);
    // Only re-run when the source changes, not on every render of play().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, autoPlay]);

  // Choosing a speed is the learner asking to hear it that way, so replay at
  // once. The guard keeps this from firing on mount, where `autoPlay` already
  // decides whether anything should play.
  const lastRateRef = useRef(rate);
  useEffect(() => {
    if (lastRateRef.current === rate) return;
    lastRateRef.current = rate;
    const timer = window.setTimeout(() => void play(), 0);
    return () => window.clearTimeout(timer);
  }, [rate, play]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (blobRef.current) URL.revokeObjectURL(blobRef.current.url);
  }, []);

  const large = size === "large";
  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={state === "loading"}
      aria-label={label}
      data-hidden-audio={state}
      className={large
        ? "mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#f7d779] shadow-[0_12px_30px_rgba(216,154,43,.25)] disabled:opacity-60"
        : "inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f7d779] px-4 text-sm font-black text-[#18332d] disabled:opacity-60"}
    >
      {state === "loading" ? <LoaderCircle className={`${large ? "h-9 w-9" : "h-4 w-4"} animate-spin`} /> : <Volume2 className={`${large ? "h-9 w-9" : "h-4 w-4"} ${state === "playing" ? "animate-pulse" : ""}`} />}
      {!large && <span>{label}</span>}
    </button>
  );
}
