import { describe, expect, it } from "vitest";
import { createTTSAudioFilename, createTTSCacheKey, resolveTTSCacheKeyInput } from "./cache-key";

const input = {
  text: "extraordinary",
  voice: "test-voice",
  engineVersion: "kokoro-test",
};

describe("khóa cache TTS", () => {
  it("ổn định và thay đổi theo văn bản, giọng đọc, phiên bản engine và tốc độ", async () => {
    const original = await createTTSCacheKey(input);

    expect(await createTTSCacheKey(input)).toBe(original);
    expect(await createTTSCacheKey({ ...input, text: "ordinary" })).not.toBe(original);
    expect(await createTTSCacheKey({ ...input, voice: "other-voice" })).not.toBe(original);
    expect(await createTTSCacheKey({ ...input, engineVersion: "kokoro-next" })).not.toBe(original);
    expect(await createTTSCacheKey({ ...input, speed: 0.8 })).not.toBe(original);
  });

  it("chuẩn hóa Unicode và khoảng trắng trước khi băm", async () => {
    expect(await createTTSCacheKey({ ...input, text: "  apple\n\tpie  " })).toBe(
      await createTTSCacheKey({ ...input, text: "apple pie" })
    );
    expect(await createTTSCacheKey({ ...input, text: "cafe\u0301" })).toBe(
      await createTTSCacheKey({ ...input, text: "café" })
    );
  });

  it("băm voice đã phân giải thay vì để voice undefined phân mảnh cache", async () => {
    const resolved = resolveTTSCacheKeyInput({ text: input.text, engineVersion: input.engineVersion }, "default-voice");
    expect(resolved.voice).toBe("default-voice");
    expect(await createTTSCacheKey(resolved)).toBe(
      await createTTSCacheKey({ ...input, voice: "default-voice" })
    );
    await expect(createTTSCacheKey({ ...input, voice: "" })).rejects.toThrow("Giọng đọc đã phân giải");
  });

  it("không để lộ văn bản nguồn trong khóa hoặc tên tệp", async () => {
    const key = await createTTSCacheKey(input);
    const filename = await createTTSAudioFilename(input);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(filename).toMatch(/^[a-f0-9]{64}\.wav$/);
    expect(key.toLowerCase()).not.toContain(input.text.toLowerCase());
    expect(filename.toLowerCase()).not.toContain(input.text.toLowerCase());
  });

  it("dùng vector SHA-256 xác định giữa các Web Crypto implementation", async () => {
    expect(await createTTSCacheKey(input)).toBe(
      "fea19b5f362d78af98ce622afb6bd69a0aafe21b62953cfe06d67f7b36e96b13"
    );
  });
});
