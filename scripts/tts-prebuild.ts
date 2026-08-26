/**
 * Prebuild TTS audio — sinh sẵn âm thanh trước khi chạy runtime.
 *
 * - Tiếng Anh (116 từ vựng): Kokoro-82M chạy trực tiếp trên Node (kokoro-js).
 * - Tiếng Việt (chú giải nghĩa, tiêu đề ngữ pháp): VieNeu qua sidecar HTTP.
 *
 * Đầu ra được ghi theo khóa cache (SHA-256 của text + voice + engine version
 * + speed) để trình duyệt/API route tìm đúng file, không tổng hợp lại runtime.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vocabulary from "../dataset/vocabulary.json";
import grammar from "../dataset/grammar-reference.json";
import { KokoroTTS } from "kokoro-js";
import { createTTSAudioFilename, resolveTTSCacheKeyInput } from "../src/core/tts/cache-key";

const kokoroModelId = process.env.KOKORO_MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const kokoroVoice = process.env.KOKORO_DEFAULT_VOICE ?? "bf_emma";
const kokoroEngineVersion = "kokoro-js@1.2.1-q8";

const vieNeuUrl = process.env.VIENEU_URL ?? "http://localhost:8001";
let vieVoice = process.env.VIENEU_DEFAULT_VOICE ?? "";
const vieEngineVersion = "vieneu-3.3.0";

const cacheRoot = path.resolve(process.env.TTS_CACHE_DIR ?? "public/tts");
const kokoroOutputDirectory = path.join(cacheRoot, "kokoro");
const vieOutputDirectory = path.join(cacheRoot, "vie");

async function prebuildKokoro() {
  console.log(`[prebuild] Kokoro: 116 từ vựng → ${kokoroOutputDirectory}`);
  await mkdir(kokoroOutputDirectory, { recursive: true });
  const tts = await KokoroTTS.from_pretrained(kokoroModelId, { dtype: "q8", device: "cpu" });
  let count = 0;
  for (const item of vocabulary.items) {
    const input = resolveTTSCacheKeyInput({ text: item.displayText, engineVersion: kokoroEngineVersion }, kokoroVoice);
    const filename = await createTTSAudioFilename(input);
    const audio = await tts.generate(input.text, { voice: input.voice as never, speed: 1 });
    await writeFile(path.join(kokoroOutputDirectory, filename), Buffer.from(audio.toWav()));
    count += 1;
  }
  console.log(`[prebuild] Kokoro xong: ${count} tệp (voice ${kokoroVoice}).`);
}

async function prebuildVie() {
  console.log(`[prebuild] VieNeu: nội dung tiếng Việt → ${vieOutputDirectory}`);
  await mkdir(vieOutputDirectory, { recursive: true });

  // Xác định voice mặc định: cấu hình env, nếu rỗng thì lấy runtime từ sidecar
  if (!vieVoice) {
    try {
      const voicesResponse = await fetch(`${vieNeuUrl}/voices`);
      if (voicesResponse.ok) {
        const voices = (await voicesResponse.json()) as Array<{ name: string }>;
        vieVoice = voices[0]?.name ?? "";
        console.log(`[prebuild] VieNeu: chọn voice runtime "${vieVoice}".`);
      }
    } catch {
      console.warn("[prebuild] Không lấy được danh sách voice từ sidecar; cần VIENEU_DEFAULT_VOICE.");
    }
  }
  if (!vieVoice) {
    throw new Error("Thiếu VIENEU_DEFAULT_VOICE và sidecar /voices không khả dụng — không thể băm cache tiếng Việt.");
  }

  // Thu thập các chuỗi tiếng Việt cần đọc
  const texts: string[] = [];
  for (const item of vocabulary.items) {
    if (item.meaningVi) texts.push(item.meaningVi);
  }
  for (const item of grammar.items) {
    if (item.title) texts.push(item.title);
  }

  // Khử trùng lặp, giữ thứ tự
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  console.log(`[prebuild] VieNeu: ${unique.length} chuỗi tiếng Việt độc nhất.`);

  if (!vieVoice) {
    console.warn("[prebuild] VIENEU_DEFAULT_VOICE rỗng — dùng voice mặc định của sidecar (bỏ qua voice trong khóa cache).");
  }

  let count = 0;
  for (const text of unique) {
    const input = resolveTTSCacheKeyInput({ text, engineVersion: vieEngineVersion }, vieVoice);
    const key = await createTTSAudioFilename(input);
    const outputPath = path.join(vieOutputDirectory, key);

    // Bỏ qua nếu đã tồn tại (idempotent)
    const { access } = await import("node:fs/promises");
    try { await access(outputPath); continue; } catch { /* chưa tồn tại */ }

    const response = await fetch(`${vieNeuUrl}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.TTS_API_KEY ? { "X-TTS-Key": process.env.TTS_API_KEY } : {}),
      },
      body: JSON.stringify({ text, voice: vieVoice || undefined, speed: 1 }),
    });
    if (!response.ok) {
      throw new Error(`VieNeu prebuild lỗi ${response.status} cho: "${text.slice(0, 40)}…"`);
    }
    const wav = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, wav);
    count += 1;
  }
  console.log(`[prebuild] VieNeu xong: ${count} tệp mới.`);
}

async function main() {
  await prebuildKokoro();
  await prebuildVie();
  console.log("[prebuild] Hoàn tất toàn bộ.");
}

void main().catch((error) => {
  console.error("[prebuild] Thất bại:", error);
  process.exit(1);
});
