/**
 * Prebuild TTS audio — sinh sẵn âm thanh trước khi chạy runtime.
 *
 * - Tiếng Việt (chú giải nghĩa, tiêu đề ngữ pháp): VieNeu qua sidecar HTTP.
 *
 * Đầu ra được ghi theo khóa cache (SHA-256 của text + voice + engine version
 * + speed) để trình duyệt/API route tìm đúng file, không tổng hợp lại runtime.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vocabulary from "../dataset/vocabulary.json";
import grammar from "../dataset/grammar-reference.json";
import { createTTSAudioFilename, resolveTTSCacheKeyInput } from "../src/core/tts/cache-key";

const vieNeuUrl = process.env.VIENEU_URL ?? "http://localhost:8001";
let vieVoice = process.env.VIENEU_DEFAULT_VOICE ?? "";
const vieEngineVersion = "vieneu-3.3.0";

const cacheRoot = path.resolve(process.env.TTS_CACHE_DIR ?? "public/tts");
const vieOutputDirectory = path.join(cacheRoot, "vie");

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
  await prebuildVie();
  console.log("[prebuild] Hoàn tất toàn bộ.");
}

void main().catch((error) => {
  console.error("[prebuild] Thất bại:", error);
  process.exit(1);
});
