"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AudioLines, Sparkles, Volume2 } from "lucide-react";
import { speakCurated, stopSpeech } from "@/core/tts/speech";
import { isSpeechRecognitionSupported } from "@/core/voice/speech-recognition";
import { chooseEnglishVoice, ENGLISH_ACCENT_LABELS, type EnglishAccent, type VoiceTier } from "@/core/voice/voice-policy";
import { loadVoiceCapabilities, useVoiceCapabilities, type PublicCuratedVoice } from "./voice-capabilities";
import { setPreferredAiVoice, setVoicePreferences, useVoicePreferences, VOICE_RATE_OPTIONS } from "./voice-preferences";

const SAMPLE_LINE = "Hello! I lost my suitcase at the airport. Could you help me find it?";
const SAMPLE_LINE_VI = "Bạn nói rất rõ. Hãy thử lại câu này chậm hơn một chút nhé.";

const TIER_LABELS: Record<VoiceTier, string> = {
  NEURAL: "giọng neural, chuẩn nhất trên thiết bị này",
  PREMIUM: "giọng chất lượng cao của hệ điều hành",
  SYSTEM: "giọng hệ thống",
  REMOTE: "giọng mạng của Google (dự phòng)",
};

const AI_TIER_LABELS: Record<PublicCuratedVoice["tier"], string> = {
  TOP: "được đánh giá cao",
  GOOD: "tốt",
  OK: "dùng được",
};

function subscribeVoicesChanged(listener: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", listener);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", listener);
}

function describeEnglishVoice(accent: EnglishAccent) {
  if (typeof window === "undefined" || !window.speechSynthesis) return "Trình duyệt này không có giọng đọc.";
  const voices = window.speechSynthesis.getVoices();
  const choice = chooseEnglishVoice(voices, accent);
  if (!choice) return voices.length ? "Chưa có giọng tiếng Anh phù hợp trên thiết bị." : "";
  const accentNote = choice.accentMatched ? "" : " (thiết bị không có giọng đúng accent, đang dùng giọng Anh khác)";
  return `${choice.voice.name}: ${TIER_LABELS[choice.tier]}${accentNote}`;
}

const noSubscription = () => () => {};

function AiVoicePicker({ label, voices, selected, onSelect, sample, lang }: {
  label: string;
  voices: PublicCuratedVoice[];
  selected?: string;
  onSelect: (id: string | undefined) => void;
  sample: string;
  lang: "en" | "vi";
}) {
  if (!voices.length) return null;
  return (
    <fieldset className="mt-4">
      <legend className="text-xs font-black text-[#45584f]">{label}</legend>
      <div className="mt-1.5 space-y-1.5">
        {voices.map((voice, index) => {
          const active = selected ? selected === voice.id : index === 0;
          return (
            <div key={voice.id} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${active ? "border-[#176b55] bg-[#dff2e8]" : "border-[#ded8cc] bg-white"}`}>
              <button type="button" onClick={() => onSelect(index === 0 ? undefined : voice.id)} aria-pressed={active} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-black">{voice.name} <span className="text-[10px] font-black uppercase tracking-[.1em] text-[#176b55]">{AI_TIER_LABELS[voice.tier]}</span></span>
                <span className="block truncate text-[11px] font-bold text-[#8a918d]">{voice.subtitle}</span>
              </button>
              <button type="button" aria-label={`Nghe thử ${voice.name}`} onClick={() => void speakCurated({ text: sample, lang, voice: voice.id })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#18332d] text-[#f7d779]"><Volume2 className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Learner voice preferences (Plan14 SPEC-P142 §2, Plan15 §1): engine (AI voice
 * or browser), accent, curated AI voices, speed, auto-read and coach voice.
 */
export function VoiceSettings({ className = "" }: { className?: string }) {
  const preferences = useVoicePreferences();
  const capabilities = useVoiceCapabilities();
  useEffect(() => {
    void loadVoiceCapabilities();
  }, []);
  const voiceDescription = useSyncExternalStore(
    subscribeVoicesChanged,
    () => describeEnglishVoice(preferences.accent),
    () => "",
  );
  const sttSupported = useSyncExternalStore(noSubscription, isSpeechRecognitionSupported, () => true);
  const aiVoiceActive = capabilities.aiVoice && preferences.engine === "auto";

  return (
    <section className={`rounded-[26px] border border-[#ded8cc] bg-[#fffdf8] p-5 ${className}`} aria-label="Cài đặt giọng nói">
      <div className="flex items-center justify-between gap-2 text-[#176b55]">
        <span className="flex items-center gap-2"><AudioLines className="h-5 w-5" /><p className="text-[11px] font-black uppercase tracking-[.15em]">Voice AI</p></span>
        {capabilities.aiVoice && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#dff2e8] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em]" data-ai-voice={aiVoiceActive ? "on" : "off"}><Sparkles className="h-3 w-3" /> Giọng AI {aiVoiceActive ? "đang bật" : "tắt"}</span>
        )}
      </div>

      {capabilities.aiVoice && (
        <label className="mt-4 flex items-center justify-between gap-3 text-xs font-black text-[#45584f]">
          Dùng giọng AI (ElevenLabs) khi có
          <input type="checkbox" checked={preferences.engine === "auto"} onChange={(event) => setVoicePreferences({ engine: event.target.checked ? "auto" : "browser" })} className="h-5 w-5 accent-[#176b55]" />
        </label>
      )}

      <label className="mt-4 block text-xs font-black text-[#45584f]">
        Accent tiếng Anh
        <select
          value={preferences.accent}
          onChange={(event) => setVoicePreferences({ accent: event.target.value as EnglishAccent })}
          className="mt-1.5 w-full rounded-xl border-2 border-[#ded8cc] bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#176b55]"
        >
          {(Object.keys(ENGLISH_ACCENT_LABELS) as EnglishAccent[]).map((accent) => (
            <option key={accent} value={accent}>{ENGLISH_ACCENT_LABELS[accent]}</option>
          ))}
        </select>
      </label>

      {aiVoiceActive ? (
        <>
          <AiVoicePicker
            label="Giọng AI tiếng Anh (đã chọn lọc cho học phát âm)"
            voices={capabilities.voices[preferences.accent]}
            selected={preferences.aiVoices[preferences.accent]}
            onSelect={(id) => setPreferredAiVoice(preferences.accent, id)}
            sample={SAMPLE_LINE}
            lang="en"
          />
          <AiVoicePicker
            label="Giọng AI cho lời Coach tiếng Việt"
            voices={capabilities.voices.vi}
            selected={preferences.aiVoices.vi}
            onSelect={(id) => setPreferredAiVoice("vi", id)}
            sample={SAMPLE_LINE_VI}
            lang="vi"
          />
        </>
      ) : (
        voiceDescription && <p className="mt-1.5 text-[11px] font-bold leading-5 text-[#8a918d]">Giọng đang dùng: {voiceDescription}</p>
      )}

      <fieldset className="mt-4">
        <legend className="text-xs font-black text-[#45584f]">Tốc độ</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {VOICE_RATE_OPTIONS.map((option) => {
            const active = option.value === preferences.rate;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setVoicePreferences({ rate: option.value })}
                aria-pressed={active}
                className={`min-h-10 rounded-xl border-2 text-xs font-black ${active ? "border-[#176b55] bg-[#dff2e8] text-[#176b55]" : "border-[#ded8cc] bg-white"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-4 flex items-center justify-between gap-3 text-xs font-black text-[#45584f]">
        Tự đọc lượt AI mới
        <input type="checkbox" checked={preferences.autoSpeak} onChange={(event) => setVoicePreferences({ autoSpeak: event.target.checked })} className="h-5 w-5 accent-[#176b55]" />
      </label>
      <label className="mt-3 flex items-center justify-between gap-3 text-xs font-black text-[#45584f]">
        Đọc cả lời Coach tiếng Việt
        <input type="checkbox" checked={preferences.coachVoice} onChange={(event) => setVoicePreferences({ coachVoice: event.target.checked })} className="h-5 w-5 accent-[#176b55]" />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void speakCurated({ text: SAMPLE_LINE, lang: "en", rate: preferences.rate })}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#18332d] px-3 text-xs font-black text-white"
        >
          <Volume2 className="h-4 w-4 text-[#f7d779]" /> Nghe thử giọng
        </button>
        <button type="button" onClick={() => void stopSpeech()} className="min-h-10 rounded-xl px-2 text-xs font-black text-[#748079]">Dừng</button>
      </div>

      {!sttSupported && (
        <p className="mt-3 text-[11px] font-bold leading-5 text-[#a33f3a]">
          Trình duyệt này chưa hỗ trợ nói để trả lời (Firefox). Bạn vẫn nghe được AI và có thể gõ câu trả lời.
        </p>
      )}
    </section>
  );
}
