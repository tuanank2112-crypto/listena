import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vocabulary from "../dataset/vocabulary.json";
import { KokoroTTS } from "kokoro-js";
import { createTTSAudioFilename, resolveTTSCacheKeyInput } from "../src/core/tts/cache-key";

const modelId = process.env.KOKORO_MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const voice = process.env.KOKORO_DEFAULT_VOICE ?? "bf_emma";
const outputDirectory = path.resolve(process.env.TTS_CACHE_DIR ?? "public/tts", "kokoro");
const engineVersion = "kokoro-js@1.2.1-q8";

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const tts = await KokoroTTS.from_pretrained(modelId, { dtype: "q8", device: "cpu" });
  for (const item of vocabulary.items) {
    const input = resolveTTSCacheKeyInput({ text: item.displayText, engineVersion }, voice);
    const filename = await createTTSAudioFilename(input);
    const audio = await tts.generate(input.text, { voice: input.voice as never, speed: 1 });
    await writeFile(path.join(outputDirectory, filename), Buffer.from(audio.toWav()));
  }
  console.log("Đã tạo " + vocabulary.items.length + " tệp Kokoro với voice " + voice + ".");
}
void main();
