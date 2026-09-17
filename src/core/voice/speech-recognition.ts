"use client";

/**
 * Thin wrapper over the browser speech recogniser (Plan14 SPEC-P141 §2).
 *
 * Audio never leaves the browser through our code: Chrome/Edge/Safari perform
 * recognition with their own service and hand back text. Firefox has no
 * recogniser, so `isSpeechRecognitionSupported()` is false there and the UI
 * keeps the typed path. No server-side speech-to-text exists in this repo.
 */

export type VoiceInputErrorCode =
  | "unsupported"
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "failed";

export class VoiceInputError extends Error {
  constructor(readonly code: VoiceInputErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VoiceInputError";
  }
}

export interface RecognitionResult {
  transcript: string;
  /** Recogniser confidence for the best alternative when reported. */
  confidence: number | null;
  alternatives: string[];
}

export interface RecognitionStartOptions {
  lang: string;
  onInterim?: (text: string) => void;
  signal?: AbortSignal;
  /** Hard stop; the recogniser then finalises what it heard. */
  maxDurationMs?: number;
}

export interface Recognizer {
  start(options: RecognitionStartOptions): Promise<RecognitionResult>;
  stop(): void;
  abort(): void;
}

/* Minimal typings: the Web Speech recognition API is not in TypeScript's DOM lib. */
interface BrowserRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface BrowserRecognitionResultItem {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserRecognitionAlternative;
}
interface BrowserRecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: BrowserRecognitionResultItem };
}
interface BrowserRecognitionErrorEvent {
  error: string;
}
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onerror: ((event: BrowserRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type BrowserRecognitionConstructor = new () => BrowserRecognition;

function resolveConstructor(): BrowserRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: BrowserRecognitionConstructor;
    webkitSpeechRecognition?: BrowserRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported() {
  return resolveConstructor() !== null;
}

export const DEFAULT_MAX_LISTEN_MS = 15_000;

export function mapRecognitionError(error: string): VoiceInputErrorCode {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "failed";
  }
}

export function describeVoiceInputError(code: VoiceInputErrorCode) {
  switch (code) {
    case "unsupported":
      return "Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome, Edge hoặc Safari, hoặc gõ câu trả lời.";
    case "not-allowed":
      return "Bạn chưa cho phép dùng micro. Hãy bật quyền micro cho trang này rồi thử lại.";
    case "no-speech":
      return "Chưa nghe thấy gì. Hãy nói to, rõ và gần micro hơn.";
    case "audio-capture":
      return "Không tìm thấy micro. Hãy kiểm tra thiết bị thu âm.";
    case "network":
      return "Nhận dạng giọng nói cần kết nối mạng. Hãy kiểm tra mạng rồi thử lại.";
    case "aborted":
      return "Đã dừng thu âm.";
    default:
      return "Không nhận dạng được. Hãy thử lại hoặc gõ câu trả lời.";
  }
}

/**
 * Create a one-shot recogniser. Each `start()` listens for a single utterance
 * (non-continuous), reports interim text, and resolves with the final result.
 */
export function createBrowserRecognizer(): Recognizer | null {
  const Constructor = resolveConstructor();
  if (!Constructor) return null;
  let active: BrowserRecognition | null = null;

  return {
    start(options) {
      return new Promise<RecognitionResult>((resolve, reject) => {
        const recognition = new Constructor();
        active = recognition;
        recognition.lang = options.lang;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;

        let finalResult: RecognitionResult | null = null;
        let failure: VoiceInputError | null = null;
        let settled = false;
        const timer = setTimeout(() => recognition.stop(), options.maxDurationMs ?? DEFAULT_MAX_LISTEN_MS);

        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          options.signal?.removeEventListener("abort", onAbort);
          if (active === recognition) active = null;
          if (finalResult) resolve(finalResult);
          else reject(failure ?? new VoiceInputError("no-speech"));
        };

        const onAbort = () => {
          failure = new VoiceInputError("aborted");
          recognition.abort();
        };
        if (options.signal?.aborted) {
          onAbort();
          finish();
          return;
        }
        options.signal?.addEventListener("abort", onAbort, { once: true });

        recognition.onresult = (event) => {
          let interim = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const item = event.results[index];
            const best = item[0];
            if (!best) continue;
            if (item.isFinal) {
              const alternatives: string[] = [];
              for (let alt = 0; alt < item.length; alt += 1) {
                const text = item[alt]?.transcript?.trim();
                if (text) alternatives.push(text);
              }
              finalResult = {
                transcript: best.transcript.trim(),
                confidence: Number.isFinite(best.confidence) && best.confidence > 0 ? best.confidence : null,
                alternatives,
              };
            } else {
              interim += best.transcript;
            }
          }
          if (interim && options.onInterim) options.onInterim(interim.trim());
        };
        recognition.onerror = (event) => {
          failure = new VoiceInputError(mapRecognitionError(event.error));
        };
        recognition.onend = finish;

        try {
          recognition.start();
        } catch (cause) {
          failure = new VoiceInputError("failed", cause instanceof Error ? cause.message : undefined);
          finish();
        }
      });
    },
    stop() {
      active?.stop();
    },
    abort() {
      active?.abort();
    },
  };
}
