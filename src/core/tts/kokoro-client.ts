"use client";

import { createTTSCacheKey, resolveTTSCacheKeyInput } from "./cache-key";
import type { SpeakOptions, SpeakResult, SpeechEngine, SpeechEngineContext } from "./speech";

const MODEL_ID = process.env.NEXT_PUBLIC_KOKORO_MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = process.env.NEXT_PUBLIC_KOKORO_DEFAULT_VOICE ?? "bf_emma";
const ENGINE_VERSION = "kokoro-js@1.2.1-q8";
const CACHE_NAME = "listena-kokoro-audio";
const PREBUILT_AUDIO_PATH = "/tts/kokoro";

type WorkerResponse = { type: string; wav?: ArrayBuffer; cached?: boolean };
type Pending = { resolve: (value: WorkerResponse) => void; reject: (reason: Error) => void; context: SpeechEngineContext };

export class KokoroSpeechEngine implements SpeechEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private audio: HTMLAudioElement | null = null;

  private getWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url));
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    return this.worker;
  }

  private handleMessage(message: { type: string; id?: number; progress?: number | null; message?: string; wav?: ArrayBuffer; cached?: boolean }) {
    if (message.type === "progress") {
      this.pending.forEach(({ context }) => context.updateState({ phase: "downloading-model", downloadProgress: message.progress ?? null }));
      return;
    }
    const pending = this.pending.get(message.id ?? -1);
    if (!pending) return;
    this.pending.delete(message.id ?? -1);
    if (message.type === "error") return pending.reject(new Error(message.message));
    pending.resolve(message);
  }

  private request(message: object, context: SpeechEngineContext) {
    const id = this.nextId++;
    return new Promise<{ type: string; wav?: ArrayBuffer; cached?: boolean }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, context });
      context.signal.addEventListener("abort", () => {
        this.pending.delete(id);
        reject(new DOMException("Đã hủy phát âm thanh", "AbortError"));
      }, { once: true });
      this.getWorker().postMessage({ ...message, id });
    });
  }

  async prepare(context: SpeechEngineContext): Promise<SpeakResult> {
    context.updateState({ phase: "downloading-model", downloadProgress: 0, error: null });
    await this.request({ type: "prepare", modelId: MODEL_ID }, context);
    await this.request({ type: "voices", modelId: MODEL_ID }, context);
    return { ok: true, status: "completed", cached: false };
  }

  async speak(options: SpeakOptions, context: SpeechEngineContext): Promise<SpeakResult> {
    const resolved = resolveTTSCacheKeyInput({ text: options.text, engineVersion: ENGINE_VERSION, speed: options.speed }, options.voice ?? DEFAULT_VOICE);
    const key = await createTTSCacheKey(resolved);
    context.updateState({ phase: "synthesizing", error: null });
    const cached = await readCache(key).catch(() => undefined);
    const prebuilt = cached ? undefined : await readPrebuiltAudio(key);
    const wav = cached ?? prebuilt ?? (await this.request({ type: "generate", modelId: MODEL_ID, text: resolved.text, voice: resolved.voice, speed: resolved.speed ?? 1 }, context)).wav;
    if (!wav) throw new Error("Kokoro không trả audio");
    if (!cached) await writeCache(key, wav).catch(() => undefined);
    await this.play(wav, context);
    return { ok: true, status: "completed", cached: Boolean(cached || prebuilt) };
  }

  async stop() { this.audio?.pause(); this.audio = null; }

  private play(wav: ArrayBuffer, context: SpeechEngineContext) {
    return new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const audio = new Audio(url);
      this.audio = audio;
      const cleanup = () => { URL.revokeObjectURL(url); if (this.audio === audio) this.audio = null; };
      context.signal.addEventListener("abort", () => { audio.pause(); cleanup(); reject(new DOMException("Đã hủy phát âm thanh", "AbortError")); }, { once: true });
      audio.onplay = () => context.updateState({ phase: "playing", downloadProgress: null });
      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("Không thể phát audio Kokoro")); };
      void audio.play().catch((error) => { cleanup(); reject(error); });
    });
  }
}

async function readPrebuiltAudio(key: string) {
  const response = await fetch(PREBUILT_AUDIO_PATH + "/" + key + ".wav", { cache: "force-cache" });
  return response.ok ? response.arrayBuffer() : undefined;
}

function openCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("audio");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(key: string) {
  const database = await openCache();
  return new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const request = database.transaction("audio").objectStore("audio").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeCache(key: string, audio: ArrayBuffer) {
  const database = await openCache();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction("audio", "readwrite").objectStore("audio").put(audio, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
