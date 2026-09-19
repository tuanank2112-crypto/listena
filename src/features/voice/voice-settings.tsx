"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AudioLines, Sparkles, Volume2 } from "lucide-react";
import { speakCurated, speakWithBrowserVoice, stopSpeech } from "@/core/tts/speech";
import { isSpeechRecognitionSupported } from "@/core/voice/speech-recognition";
import {
  ENGLISH_ACCENT_LABELS,
  rankEnglishVoices,
  type EnglishAccent,
  type VoiceChoice,
  type VoiceTier,
} from "@/core/voice/voice-policy";
import { loadVoiceCapabilities, useVoiceCapabilities, type PublicCuratedVoice } from "./voice-capabilities";
import {
  setPreferredAiVoice,
  setPreferredBrowserVoice,
  setVoicePreferences,
  useVoicePreferences,
  VOICE_RATE_OPTIONS,
} from "./voice-preferences";

/** More than this and the learner stops reading; voice 7 is worse anyway (SPEC-P181 U1). */
const MAX_BROWSER_VOICE_CHOICES = 6;

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

const noSubscription = () => () => {};

/**
 * The voices installed on this device, read as an external store. Chrome
 * populates the list asynchronously, so an empty list means "still loading",
 * never "none" (SPEC-P181 U4); `supported === null` until the client looks.
 * `getVoices()` hands back a fresh array every call, so the snapshot is cached
 * by element identity — `useSyncExternalStore` requires a stable reference.
 */
interface SystemVoiceState {
  voices: SpeechSynthesisVoice[];
  supported: boolean | null;
}

const SERVER_VOICE_STATE: SystemVoiceState = { voices: [], supported: null };
let voiceState: SystemVoiceState = SERVER_VOICE_STATE;

function subscribeSystemVoices(listener: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", listener);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", listener);
}

function getSystemVoices(): SystemVoiceState {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (voiceState.supported !== false) voiceState = { voices: [], supported: false };
    return voiceState;
  }
  const next = window.speechSynthesis.getVoices();
  const unchanged =
    voiceState.supported === true &&
    next.length === voiceState.voices.length &&
    next.every((voice, index) => voice === voiceState.voices[index]);
  if (!unchanged) voiceState = { voices: next, supported: true };
  return voiceState;
}

const getServerSystemVoices = () => SERVER_VOICE_STATE;

/** Test helper: forget the cached voice snapshot between renders. */
export function resetSystemVoiceSnapshotForTests() {
  voiceState = SERVER_VOICE_STATE;
}

function useSystemVoices() {
  return useSyncExternalStore(subscribeSystemVoices, getSystemVoices, getServerSystemVoices);
}

export interface BrowserVoiceOptions {
  /** Rows to render, best first: the top slice plus the pin when it fell outside. */
  shown: Array<VoiceChoice<SpeechSynthesisVoice>>;
  /** The pinned voice, when it still exists on this device. */
  pinnedChoice?: VoiceChoice<SpeechSynthesisVoice>;
  /** What "Tự động" resolves to right now. */
  auto?: VoiceChoice<SpeechSynthesisVoice>;
  /** A pin that no longer matches any installed voice (SPEC-P181 U5). */
  pinnedMissing: boolean;
}

/**
 * Turn the ranked voices into the rows the picker shows (SPEC-P181 U1/U5).
 * Pure so the trimming and the missing-pin case can be tested without a DOM.
 */
export function buildBrowserVoiceOptions(
  ranked: Array<VoiceChoice<SpeechSynthesisVoice>>,
  pinned: string | undefined,
  hasVoices: boolean,
  max = MAX_BROWSER_VOICE_CHOICES,
): BrowserVoiceOptions {
  const pinnedChoice = pinned
    ? ranked.find((item) => item.voice.voiceURI === pinned || item.voice.name === pinned)
    : undefined;
  const top = ranked.slice(0, max);
  // A pin outside the top slice must still be visible as the active choice.
  const shown = pinnedChoice && !top.includes(pinnedChoice) ? [...top, pinnedChoice] : top;
  return {
    shown,
    ...(pinnedChoice ? { pinnedChoice } : {}),
    ...(ranked[0] ? { auto: ranked[0] } : {}),
    pinnedMissing: Boolean(pinned) && hasVoices && !pinnedChoice,
  };
}

/**
 * Learner-facing picker for the free voices already on this device
 * (Plan18 SPEC-P181 §5). Preview goes through `speakWithBrowserVoice` so it
 * plays the system voice even when the ElevenLabs engine is configured.
 */
function BrowserVoicePicker({ accent, rate, pinned }: { accent: EnglishAccent; rate: number; pinned?: string }) {
  const { voices, supported } = useSystemVoices();

  const ranked = useMemo(() => rankEnglishVoices(voices, accent), [voices, accent]);
  const { shown, pinnedChoice, auto, pinnedMissing } = useMemo(
    () => buildBrowserVoiceOptions(ranked, pinned, voices.length > 0),
    [ranked, pinned, voices.length],
  );
  const hasNeural = ranked.some((item) => item.tier === "NEURAL");

  if (supported === false) {
    return <p className="mt-4 text-[11px] font-bold leading-5 text-[#8a918d]">Trình duyệt này không có giọng đọc.</p>;
  }

  return (
    <fieldset className="mt-4 min-w-0">
      <legend className="text-xs font-black text-[#45584f]">Giọng tiếng Anh trên thiết bị này</legend>
      {supported === null || (voices.length === 0 && supported) ? (
        <p className="mt-1.5 text-[11px] font-bold text-[#8a918d]">Đang tải danh sách giọng…</p>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          <VoiceRow
            active={!pinned || pinnedMissing}
            title="Tự động (tốt nhất trên máy này)"
            subtitle={auto ? `Đang dùng: ${voiceTitle(auto)} — ${describeChoice(auto)}` : "Thiết bị chưa có giọng tiếng Anh phù hợp."}
            onSelect={() => setPreferredBrowserVoice(accent, undefined)}
            onPreview={auto ? () => void speakWithBrowserVoice({ text: SAMPLE_LINE, lang: "en", voiceURI: auto.voice.voiceURI, rate }) : undefined}
            previewLabel="Nghe thử giọng tự động"
          />
          {shown.map((choice) => (
            <VoiceRow
              key={choice.voice.voiceURI || choice.voice.name}
              active={Boolean(pinnedChoice) && pinnedChoice === choice}
              title={voiceTitle(choice)}
              badge={choice.curated?.platform}
              subtitle={describeChoice(choice)}
              onSelect={() => setPreferredBrowserVoice(accent, choice.voice.voiceURI || choice.voice.name)}
              onPreview={() => void speakWithBrowserVoice({ text: SAMPLE_LINE, lang: "en", voiceURI: choice.voice.voiceURI, rate })}
              previewLabel={`Nghe thử ${voiceTitle(choice)}`}
            />
          ))}
        </div>
      )}
      {pinnedMissing && (
        <p className="mt-2 text-[11px] font-bold leading-5 text-[#a33f3a]">
          Giọng bạn đã chọn không còn trên thiết bị này, đang tạm dùng giọng tự động.
        </p>
      )}
      {supported && voices.length > 0 && !hasNeural && (
        <p className="mt-2 text-[11px] font-bold leading-5 text-[#8a918d]">
          Máy bạn mới chỉ có giọng hệ thống đời cũ. Mở app bằng Microsoft Edge để có ngay giọng Natural miễn phí, hoặc
          cài thêm ở Windows: Settings → Accessibility → Narrator → Add natural voices.
        </p>
      )}
    </fieldset>
  );
}

/** Catalogue label when we have vetted the voice, else the raw device name. */
function voiceTitle(choice: VoiceChoice<SpeechSynthesisVoice>) {
  return choice.curated?.label ?? choice.voice.name;
}

function describeChoice(choice: VoiceChoice<SpeechSynthesisVoice>) {
  const accentNote = choice.accentMatched ? "" : " (không đúng accent bạn chọn)";
  return `${choice.curated?.note ?? TIER_LABELS[choice.tier]}${accentNote}`;
}

function VoiceRow({ active, title, subtitle, badge, onSelect, onPreview, previewLabel }: {
  active: boolean;
  title: string;
  subtitle: string;
  badge?: string;
  onSelect: () => void;
  onPreview?: () => void;
  previewLabel: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${active ? "border-[#176b55] bg-[#dff2e8]" : "border-[#ded8cc] bg-white"}`}>
      <button type="button" onClick={onSelect} aria-pressed={active} className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-black">
          {title}
          {badge && <span className="ml-1.5 text-[10px] font-black uppercase tracking-[.1em] text-[#176b55]">{badge}</span>}
        </span>
        <span className="block truncate text-[11px] font-bold text-[#8a918d]">{subtitle}</span>
      </button>
      {onPreview && (
        <button
          type="button"
          aria-label={previewLabel}
          onClick={onPreview}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#18332d] text-[#f7d779]"
        >
          <Volume2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

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
    <fieldset className="mt-4 min-w-0">
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
 * Learner voice preferences (Plan14 SPEC-P142 §2, Plan15 §1, Plan18 SPEC-P181):
 * engine (AI voice or browser), accent, the browser voice picker, curated AI
 * voices, speed, auto-read and coach voice.
 */
export function VoiceSettings({ className = "" }: { className?: string }) {
  const preferences = useVoicePreferences();
  const capabilities = useVoiceCapabilities();
  useEffect(() => {
    void loadVoiceCapabilities();
  }, []);
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

      <BrowserVoicePicker accent={preferences.accent} rate={preferences.rate} pinned={preferences.browserVoices[preferences.accent]} />

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
      ) : null}

      <fieldset className="mt-4 min-w-0">
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
