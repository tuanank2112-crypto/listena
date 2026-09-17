import { prepareSpokenText } from "@/core/voice/spoken-text";
import type { VoiceScript } from "@/core/voice/voice-script";

export type SpeechLanguage = "en" | "vi";
export type SpeechPhase = "idle" | "downloading-model" | "synthesizing" | "playing" | "error";

export interface SpeakOptions {
  text: string;
  lang: SpeechLanguage;
  voice?: string;
  speed?: number;
  quality?: "fast" | "high";
}

export type SpeakResult =
  | { ok: true; status: "completed"; cached: boolean; engine?: string }
  | { ok: false; status: "cancelled" | "unavailable" | "failed"; error?: Error; engine?: string };

export interface SpeechState {
  phase: SpeechPhase;
  downloadProgress: number | null;
  error: Error | null;
}

export interface SpeechEngineContext {
  signal: AbortSignal;
  updateState(update: Partial<SpeechState>): void;
}

export interface SpeechEngine {
  prepare(context: SpeechEngineContext): Promise<SpeakResult>;
  speak(options: SpeakOptions, context: SpeechEngineContext): Promise<SpeakResult>;
  stop(): void | Promise<void>;
}

export interface SpeechWarningContext {
  lang: SpeechLanguage;
  voice?: string;
  speed?: number;
  textLength: number;
}

export type SpeechWarningHandler = (message: string, context: SpeechWarningContext) => void;
export type SpeechStateListener = () => void;

const initialState: SpeechState = { phase: "idle", downloadProgress: null, error: null };
let englishEngine: SpeechEngine | null = null;
let englishFallbackEngine: SpeechEngine | null = null;
let vietnameseEngine: SpeechEngine | null = null;
let vietnameseFallbackEngine: SpeechEngine | null = null;
let activeController: AbortController | null = null;
let latestRequestId = 0;
/** Bumped by every public entry point so a running line sequence stops when anything else speaks. */
let sequenceToken = 0;
let speechState = initialState;
const listeners = new Set<SpeechStateListener>();
let warningHandler: SpeechWarningHandler = (message, context) => {
  console.warn(message, context);
};

function updateSpeechState(update: Partial<SpeechState>) {
  speechState = { ...speechState, ...update };
  listeners.forEach((listener) => listener());
}

function createWarningContext(options: SpeakOptions): SpeechWarningContext {
  return { lang: options.lang, voice: options.voice, speed: options.speed, textLength: options.text.length };
}

function shouldUpdateRequestState(requestId: number) {
  return (update: Partial<SpeechState>) => {
    if (requestId === latestRequestId) updateSpeechState(update);
  };
}

/** "cancelled" là kết quả chủ đích và không bao giờ được kích hoạt fallback tại call site. */
export function shouldAttemptFallback(result: SpeakResult) {
  return !result.ok && (result.status === "failed" || result.status === "unavailable");
}

export function getSpeechState() {
  return speechState;
}

export function subscribeSpeechState(listener: SpeechStateListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerEnglishSpeechEngine(engine: SpeechEngine | null) {
  englishEngine = engine;
}

export function registerEnglishFallbackSpeechEngine(engine: SpeechEngine | null) {
  englishFallbackEngine = engine;
}

export function registerVietnameseSpeechEngine(engine: SpeechEngine | null) {
  vietnameseEngine = engine;
}

export function registerVietnameseFallbackSpeechEngine(engine: SpeechEngine | null) {
  vietnameseFallbackEngine = engine;
}

export function setSpeechWarningHandler(handler: SpeechWarningHandler) {
  warningHandler = handler;
}

export async function stopSpeech() {
  latestRequestId += 1;
  sequenceToken += 1;
  activeController?.abort();
  activeController = null;
  await englishEngine?.stop();
  await englishFallbackEngine?.stop();
  await vietnameseEngine?.stop();
  await vietnameseFallbackEngine?.stop();
  updateSpeechState(initialState);
}

export async function prepareSpeech(): Promise<SpeakResult> {
  const requestId = latestRequestId + 1;
  latestRequestId = requestId;
  activeController?.abort();
  activeController = null;
  await englishEngine?.stop();
  await englishFallbackEngine?.stop();
  if (requestId !== latestRequestId) return { ok: false, status: "cancelled" };
  updateSpeechState(initialState);

  if (!englishEngine) return { ok: false, status: "unavailable" };
  const controller = new AbortController();
  activeController = controller;
  try {
    const result = await englishEngine.prepare({ signal: controller.signal, updateState: shouldUpdateRequestState(requestId) });
    if (activeController === controller) activeController = null;
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return controller.signal.aborted ? { ok: false, status: "cancelled" } : { ok: false, status: "failed", error };
  }
}

async function tryEngine(engine: SpeechEngine | null, options: SpeakOptions, requestId: number): Promise<SpeakResult> {
  if (!engine) return { ok: false, status: "unavailable" };
  const controller = new AbortController();
  activeController = controller;
  try {
    const result = await engine.speak(options, {
      signal: controller.signal,
      updateState: shouldUpdateRequestState(requestId),
    });
    if (activeController === controller) {
      activeController = null;
      updateSpeechState(result.ok ? initialState : { phase: "error", error: result.error ?? null });
    }
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (activeController === controller) {
      activeController = null;
      updateSpeechState({ phase: "error", error });
    }
    if (controller.signal.aborted) return { ok: false, status: "cancelled", error };
    return { ok: false, status: "failed", error };
  }
}

export async function speak(options: SpeakOptions): Promise<SpeakResult> {
  sequenceToken += 1;
  return speakSingle(options);
}

async function speakSingle(options: SpeakOptions): Promise<SpeakResult> {
  if (!options.text.trim()) return { ok: false, status: "unavailable" };

  const requestId = latestRequestId + 1;
  latestRequestId = requestId;
  activeController?.abort();
  activeController = null;
  await englishEngine?.stop();
  await englishFallbackEngine?.stop();
  await vietnameseEngine?.stop();
  await vietnameseFallbackEngine?.stop();
  if (requestId !== latestRequestId) return { ok: false, status: "cancelled" };
  updateSpeechState(initialState);

  if (options.lang === "vi") {
    if (!vietnameseEngine && !vietnameseFallbackEngine) {
      warningHandler("Vietnamese TTS engine chưa được đăng ký.", createWarningContext(options));
      return { ok: false, status: "unavailable" };
    }
    const result = await tryEngine(vietnameseEngine, options, requestId);
    if (result.ok) return result;
    if (result.status === "cancelled") return result;
    if (shouldAttemptFallback(result) && vietnameseFallbackEngine) {
      warningHandler("VieNeu unavailable; falling back to Web Speech.", createWarningContext(options));
      return await tryEngine(vietnameseFallbackEngine, options, requestId);
    }
    return result;
  }

  // English uses the instant free system-voice path. Quality only changes
  // voice preference (Natural/Premium/Enhanced), never a model download.
  const primary = englishEngine;
  const secondary = englishFallbackEngine;

  if (!primary && !secondary) {
    warningHandler("No English TTS engine registered.", createWarningContext(options));
    return { ok: false, status: "unavailable" };
  }

  const result = await tryEngine(primary, options, requestId);
  if (result.ok) return result;
  if (result.status === "cancelled") return result;
  if (shouldAttemptFallback(result) && secondary) {
    return await tryEngine(secondary, options, requestId);
  }
  return result;
}

export interface SpeakLineInput {
  lang: SpeechLanguage;
  text: string;
  /** Playback rate; defaults to 1. */
  rate?: number;
}

export interface SpeakLinesOptions {
  voice?: string;
  quality?: SpeakOptions["quality"];
}

/**
 * Speak curated lines one after another (Plan14 SPEC-P140 §4). Each line is
 * routed by its own language, so an English NPC line and a Vietnamese coach
 * line can share one playback. Any other `speak`/`stopSpeech` call, or a newer
 * `speakLines`, cancels the remaining lines. A language whose engines are all
 * missing is skipped rather than aborting the whole sequence.
 */
export async function speakLines(lines: SpeakLineInput[], options: SpeakLinesOptions = {}): Promise<SpeakResult> {
  const token = ++sequenceToken;
  let last: SpeakResult = { ok: false, status: "unavailable" };
  for (const line of lines) {
    if (token !== sequenceToken) return { ok: false, status: "cancelled" };
    if (!line.text.trim()) continue;
    const result = await speakSingle({
      text: line.text,
      lang: line.lang,
      speed: line.rate ?? 1,
      voice: options.voice,
      quality: options.quality ?? "high",
    });
    if (!result.ok && result.status === "cancelled") return result;
    if (!result.ok && result.status === "unavailable") continue;
    last = result;
  }
  return last;
}

export interface SpeakCuratedOptions {
  text: string;
  /** Fallback language for letterless fragments; sentences are detected per line. */
  lang: SpeechLanguage;
  rate?: number;
  voice?: string;
}

/**
 * The only way ad-hoc text (vocabulary, transcripts, tutor replies) reaches a
 * voice: it is cleaned and split by `prepareSpokenText` first, so markdown,
 * emoji and mixed-language fragments never get pronounced.
 */
export async function speakCurated(options: SpeakCuratedOptions): Promise<SpeakResult> {
  const script = prepareSpokenText(options.text, options.lang);
  if (!script.lines.length) return { ok: false, status: "unavailable" };
  return speakLines(
    script.lines.map((line) => ({ lang: line.lang, text: line.text, rate: options.rate })),
    { voice: options.voice },
  );
}

export interface SpeakVoiceScriptOptions {
  /** Whether Vietnamese coach lines are voiced too (learner preference). */
  includeCoach?: boolean;
  /** Multiplies each line's own rate (learner speed preference). */
  rateScale?: number;
}

/** Play a server-curated AI turn script. */
export async function speakVoiceScript(script: VoiceScript, options: SpeakVoiceScriptOptions = {}): Promise<SpeakResult> {
  const includeCoach = options.includeCoach ?? true;
  const scale = options.rateScale ?? 1;
  const lines = script.lines
    .filter((line) => includeCoach || line.role !== "COACH")
    .map((line) => ({ lang: line.lang, text: line.text, rate: Math.max(0.5, Math.min(1.5, line.rate * scale)) }));
  return speakLines(lines);
}
