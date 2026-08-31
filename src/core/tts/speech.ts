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
