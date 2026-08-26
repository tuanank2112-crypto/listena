/// <reference lib="webworker" />

import { KokoroTTS } from "kokoro-js";

type RequestMessage =
  | { type: "prepare"; id: number; modelId: string }
  | { type: "generate"; id: number; modelId: string; text: string; voice: string; speed: number }
  | { type: "voices"; id: number; modelId: string };

let tts: KokoroTTS | null = null;
let loadedModelId: string | null = null;

async function load(modelId: string) {
  if (tts && loadedModelId === modelId) return tts;
  tts = await KokoroTTS.from_pretrained(modelId, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (progress) => {
      const value = (progress as { progress?: unknown }).progress;
      self.postMessage({ type: "progress", progress: typeof value === "number" ? Math.round(value) : null });
    },
  });
  loadedModelId = modelId;
  return tts;
}

self.onmessage = async ({ data }: MessageEvent<RequestMessage>) => {
  try {
    const model = await load(data.modelId);
    if (data.type === "prepare") return self.postMessage({ type: "complete", id: data.id, cached: false });
    if (data.type === "voices") {
      model.list_voices();
      return self.postMessage({ type: "voices", id: data.id, voices: Object.entries(model.voices) });
    }
    const audio = await model.generate(data.text, { voice: data.voice as never, speed: data.speed });
    const wav = audio.toWav();
    self.postMessage({ type: "audio", id: data.id, wav }, [wav]);
  } catch (error) {
    self.postMessage({ type: "error", id: data.id, message: error instanceof Error ? error.message : String(error) });
  }
};
