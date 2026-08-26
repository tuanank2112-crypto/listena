export interface TTSCacheKeyInput {
  text: string;
  voice: string;
  engineVersion: string;
  speed?: number;
}

export interface UnresolvedTTSCacheKeyInput extends Omit<TTSCacheKeyInput, "voice"> {
  voice?: string;
}

export function resolveTTSCacheKeyInput(
  input: UnresolvedTTSCacheKeyInput,
  defaultVoice: string
): TTSCacheKeyInput {
  const voice = input.voice?.trim() || defaultVoice.trim();
  if (!voice) throw new Error("Giọng đọc đã phân giải là bắt buộc để tạo khóa cache");
  return { ...input, voice };
}

export function normalizeTTSText(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createTTSCacheKey(input: TTSCacheKeyInput) {
  if (!input.voice.trim()) throw new Error("Giọng đọc đã phân giải là bắt buộc để tạo khóa cache");
  // Thứ tự và tên trường là hợp đồng cache; sửa chúng làm vô hiệu audio đã lưu. Test vector SHA-256 phát hiện thay đổi này.
  const payload = JSON.stringify({
    engineVersion: input.engineVersion.trim(),
    voice: input.voice.trim(),
    speed: input.speed ?? 1,
    text: normalizeTTSText(input.text),
  });
  const data = new TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);

  return bytesToHex(new Uint8Array(digest));
}

export async function createTTSAudioFilename(
  input: TTSCacheKeyInput,
  extension = "wav"
) {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!safeExtension) throw new Error("Định dạng tệp âm thanh không hợp lệ");

  return `${await createTTSCacheKey(input)}.${safeExtension}`;
}
