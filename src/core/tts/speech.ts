export type SpeechLanguage = "en" | "vi";
export type SpeechPhase = "idle" | "downloading-model" | "synthesizing" | "playing" | "error";

export interface SpeakOptions {
  text: string;
  lang: SpeechLanguage;
  voice?: string;
  speed?: number;
}

export type SpeakResult =
  | { ok: true; status: "completed"; cached: boolean }
  | { ok: false; status: "cancelled" | "unavailable" | "failed"; error?: Error };

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
let vietnameseEngine: SpeechEngine | null = null;
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

function fallbackToWebSpeech(options: SpeakOptions) {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(options.text);
    utterance.lang = "en-GB";
    utterance.rate = options.speed ?? 1;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterance);
  });
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

export function registerVietnameseSpeechEngine(engine: SpeechEngine | null) {
  vietnameseEngine = engine;
}

export function setSpeechWarningHandler(handler: SpeechWarningHandler) {
  warningHandler = handler;
}

export async function stopSpeech() {
  latestRequestId += 1;
  activeController?.abort();
  activeController = null;
  await englishEngine?.stop();
  await vietnameseEngine?.stop();
  updateSpeechState(initialState);
}

export async function prepareSpeech(): Promise<SpeakResult> {
  const requestId = latestRequestId + 1;
  latestRequestId = requestId;
  activeController?.abort();
  activeController = null;
  await englishEngine?.stop();
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

export async function speak(options: SpeakOptions): Promise<SpeakResult> {
  if (!options.text.trim()) return { ok: false, status: "unavailable" };

  const requestId = latestRequestId + 1;
  latestRequestId = requestId;
  activeController?.abort();
  activeController = null;
  await englishEngine?.stop();
  await vietnameseEngine?.stop();
  if (requestId !== latestRequestId) return { ok: false, status: "cancelled" };
  updateSpeechState(initialState);

  // ── ĐỊNH TUYẾN DỰA TRÊN NGÔN NGỮ ──────────────────
  // tiếng Anh → Kokoro (client-side)
  // tiếng Việt → VieNeu qua sidecar
  if (options.lang === "vi") {
    if (!vietnameseEngine) {
      warningHandler("Engine TTS tiếng Việt (VieNeu) chưa được đăng ký; yêu cầu đã bị bỏ qua.", createWarningContext(options));
      return { ok: false, status: "unavailable" };
    }
    const controller = new AbortController();
    activeController = controller;
    try {
      const result = await vietnameseEngine.speak(options, {
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
      if (controller.signal.aborted) return { ok: false, status: "cancelled" };
      return { ok: false, status: "failed", error };
    }
  }

  // ── Tiếng Anh ───────────────────────────────────────
  if (!englishEngine) {
    warningHandler("Engine TTS tiếng Anh chưa được đăng ký; yêu cầu đã bị bỏ qua.", createWarningContext(options));
    return { ok: false, status: "unavailable" };
  }

  const controller = new AbortController();
  activeController = controller;

  try {
    const result = await englishEngine.speak(options, {
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
    if (controller.signal.aborted) return { ok: false, status: "cancelled" };
    if (await fallbackToWebSpeech(options)) return { ok: true, status: "completed", cached: false };
    return { ok: false, status: "failed", error };
  }
}
