import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSpeechState,
  registerEnglishFallbackSpeechEngine,
  registerEnglishSpeechEngine,
  registerVietnameseFallbackSpeechEngine,
  registerVietnameseSpeechEngine,
  setSpeechWarningHandler,
  shouldAttemptFallback,
  speak,
  speakWithBrowserVoice,
  stopSpeech,
  subscribeSpeechState,
  type SpeechEngine,
} from "./speech";

function createEngine(): SpeechEngine {
  return {
    prepare: vi.fn().mockResolvedValue({ ok: true, status: "completed", cached: true }),
    speak: vi.fn().mockResolvedValue({ ok: true, status: "completed", cached: false }),
    stop: vi.fn(),
  };
}

describe("speak", () => {
  afterEach(async () => {
    await stopSpeech();
    registerEnglishSpeechEngine(null);
    registerVietnameseSpeechEngine(null);
    setSpeechWarningHandler((message, context) => console.warn(message, context));
  });

  it("định tuyến tiếng Anh và trả kết quả khi playback hoàn tất", async () => {
    const engine = createEngine();
    registerEnglishSpeechEngine(engine);
    const result = await speak({ text: "weather", lang: "en", voice: "test-voice" });
    expect(result).toEqual({ ok: true, status: "completed", cached: false });
    expect(engine.speak).toHaveBeenCalledWith(
      { text: "weather", lang: "en", voice: "test-voice" },
      expect.objectContaining({ signal: expect.any(AbortSignal), updateState: expect.any(Function) })
    );
  });

  it("định tuyến tiếng Việt sang VieNeu engine", async () => {
    const viEngine = createEngine();
    registerVietnameseSpeechEngine(viEngine);
    const result = await speak({ text: "Xin chào", lang: "vi", voice: "test-vi-voice" });
    expect(result).toEqual({ ok: true, status: "completed", cached: false });
    expect(viEngine.speak).toHaveBeenCalledWith(
      { text: "Xin chào", lang: "vi", voice: "test-vi-voice" },
      expect.objectContaining({ signal: expect.any(AbortSignal), updateState: expect.any(Function) })
    );
  });

  it("không dùng engine tiếng Anh khi yêu cầu tiếng Việt", async () => {
    const engine = createEngine();
    const viEngine = createEngine();
    registerEnglishSpeechEngine(engine);
    registerVietnameseSpeechEngine(viEngine);
    await speak({ text: "Xin chào", lang: "vi" });
    expect(engine.speak).not.toHaveBeenCalled();
    expect(viEngine.speak).toHaveBeenCalledTimes(1);
  });

  it("cảnh báo và trả unavailable khi chưa đăng ký engine tiếng Việt", async () => {
    const warning = vi.fn();
    registerEnglishSpeechEngine(createEngine());
    setSpeechWarningHandler(warning);
    const result = await speak({ text: "Xin chào", lang: "vi" });
    expect(result).toEqual({ ok: false, status: "unavailable" });
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("chưa được đăng ký"),
      expect.objectContaining({ lang: "vi" })
    );
  });

  it("hủy yêu cầu đang chạy trước khi phát yêu cầu mới", async () => {
    let firstSignal: AbortSignal | undefined;
    let invocation = 0;
    const engine: SpeechEngine = {
      prepare: vi.fn(),
      speak: vi.fn().mockImplementation((_options, context) => {
        invocation += 1;
        if (invocation === 1) {
          firstSignal = context.signal;
          return new Promise((resolve) => {
            context.signal.addEventListener("abort", () => resolve({ ok: false, status: "cancelled" }));
          });
        }
        return Promise.resolve({ ok: true, status: "completed", cached: false });
      }),
      stop: vi.fn(),
    };
    registerEnglishSpeechEngine(engine);
    const first = speak({ text: "first", lang: "en" });
    await vi.waitFor(() => expect(engine.speak).toHaveBeenCalledTimes(1));
    const second = speak({ text: "second", lang: "en" });
    await expect(first).resolves.toEqual({ ok: false, status: "cancelled" });
    await expect(second).resolves.toEqual({ ok: true, status: "completed", cached: false });
    expect(firstSignal?.aborted).toBe(true);
  });

  it("chỉ cho phép fallback khi engine thất bại hoặc không khả dụng", () => {
    expect(shouldAttemptFallback({ ok: false, status: "cancelled" })).toBe(false);
    expect(shouldAttemptFallback({ ok: false, status: "unavailable" })).toBe(true);
    expect(shouldAttemptFallback({ ok: false, status: "failed", error: new Error("failed") })).toBe(true);
  });

  it("trả lỗi có cấu trúc thay vì ném ngoại lệ", async () => {
    const engine = createEngine();
    vi.mocked(engine.speak).mockRejectedValue(new Error("synthesis failed"));
    registerEnglishSpeechEngine(engine);
    const result = await speak({ text: "weather", lang: "en" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    if (result.ok) throw new Error("Kết quả lỗi không hợp lệ");
    expect(result.error?.message).toBe("synthesis failed");
    expect(getSpeechState().phase).toBe("error");
  });

  it("phát trạng thái và tiến độ cho subscriber", async () => {
    const snapshots: Array<[string, number | null]> = [];
    const engine: SpeechEngine = {
      prepare: vi.fn(),
      speak: vi.fn().mockImplementation(async (_options, context) => {
        context.updateState({ phase: "downloading-model", downloadProgress: 42 });
        context.updateState({ phase: "synthesizing", downloadProgress: 100 });
        context.updateState({ phase: "playing" });
        return { ok: true, status: "completed", cached: true };
      }),
      stop: vi.fn(),
    };
    registerEnglishSpeechEngine(engine);
    const unsubscribe = subscribeSpeechState(() => {
      const state = getSpeechState();
      snapshots.push([state.phase, state.downloadProgress]);
    });
    await speak({ text: "weather", lang: "en" });
    unsubscribe();
    expect(snapshots).toContainEqual(["downloading-model", 42]);
    expect(snapshots).toContainEqual(["synthesizing", 100]);
    expect(snapshots).toContainEqual(["playing", 100]);
    expect(getSpeechState()).toEqual({ phase: "idle", downloadProgress: null, error: null });
  });

  it("bỏ qua cập nhật trạng thái từ request cũ đã bị hủy", async () => {
    let staleUpdate: ((update: { phase: "error" }) => void) | undefined;
    let invocation = 0;
    const engine: SpeechEngine = {
      prepare: vi.fn(),
      speak: vi.fn().mockImplementation((_options, context) => {
        invocation += 1;
        if (invocation === 1) {
          staleUpdate = context.updateState;
          return new Promise((resolve) =>
            context.signal.addEventListener("abort", () => resolve({ ok: false, status: "cancelled" }))
          );
        }
        context.updateState({ phase: "downloading-model", downloadProgress: 25 });
        // Request mới treo lại để ta quan sát state trước khi nó hoàn tất.
        return new Promise(() => {});
      }),
      stop: vi.fn(),
    };
    registerEnglishSpeechEngine(engine);
    const first = speak({ text: "first", lang: "en" });
    await vi.waitFor(() => expect(engine.speak).toHaveBeenCalledTimes(1));
    void speak({ text: "second", lang: "en" });
    await vi.waitFor(() => expect(getSpeechState().phase).toBe("downloading-model"));
    await first;
    staleUpdate?.({ phase: "error" });
    expect(getSpeechState().phase).toBe("downloading-model");
  });
});

describe("speakLines / speakCurated / speakVoiceScript (Plan14)", () => {
  afterEach(async () => {
    await stopSpeech();
    registerEnglishSpeechEngine(null);
    registerVietnameseSpeechEngine(null);
  });

  it("routes each curated line by its own language with its own rate", async () => {
    const engine = createEngine();
    const viEngine = createEngine();
    registerEnglishSpeechEngine(engine);
    registerVietnameseSpeechEngine(viEngine);
    const { speakLines } = await import("./speech");
    const result = await speakLines([
      { lang: "en", text: "Hello there.", rate: 0.9 },
      { lang: "vi", text: "Xin chào.", rate: 1 },
    ]);
    expect(result).toEqual({ ok: true, status: "completed", cached: false });
    expect(engine.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello there.", lang: "en", speed: 0.9 }),
      expect.anything(),
    );
    expect(viEngine.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Xin chào.", lang: "vi", speed: 1 }),
      expect.anything(),
    );
  });

  it("skips a language with no engine instead of aborting the sequence", async () => {
    const engine = createEngine();
    registerEnglishSpeechEngine(engine);
    setSpeechWarningHandler(() => {});
    const { speakLines } = await import("./speech");
    const result = await speakLines([
      { lang: "vi", text: "Xin chào." },
      { lang: "en", text: "Hello." },
    ]);
    expect(result.ok).toBe(true);
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });

  it("stops the remaining lines when something else speaks in between", async () => {
    const engine = createEngine();
    registerEnglishSpeechEngine(engine);
    const { speakLines } = await import("./speech");
    const sequence = speakLines([
      { lang: "en", text: "One." },
      { lang: "en", text: "Two." },
      { lang: "en", text: "Three." },
    ]);
    await speak({ text: "Interrupt.", lang: "en" });
    const result = await sequence;
    expect(result).toEqual({ ok: false, status: "cancelled" });
    const spoken = (engine.speak as ReturnType<typeof vi.fn>).mock.calls.map((call) => (call[0] as { text: string }).text);
    expect(spoken).not.toContain("Three.");
    expect(spoken).toContain("Interrupt.");
  });

  it("speakCurated cleans the text and splits mixed-language sentences", async () => {
    const engine = createEngine();
    const viEngine = createEngine();
    registerEnglishSpeechEngine(engine);
    registerVietnameseSpeechEngine(viEngine);
    const { speakCurated } = await import("./speech");
    await speakCurated({ text: "**Great!** 🎉 Bạn làm tốt lắm.", lang: "en", rate: 0.92 });
    expect(engine.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Great!", speed: 0.92 }), expect.anything());
    expect(viEngine.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Bạn làm tốt lắm." }), expect.anything());
    await expect(speakCurated({ text: "🎉🎉", lang: "en" })).resolves.toEqual({ ok: false, status: "unavailable" });
  });

  it("speakVoiceScript can leave out coach lines and scales rates", async () => {
    const engine = createEngine();
    const viEngine = createEngine();
    registerEnglishSpeechEngine(engine);
    registerVietnameseSpeechEngine(viEngine);
    const { speakVoiceScript } = await import("./speech");
    await speakVoiceScript(
      {
        version: "v1",
        lines: [
          { role: "NPC", lang: "en", text: "Hello.", rate: 1 },
          { role: "COACH", lang: "vi", text: "Chào bạn.", rate: 1 },
        ],
      },
      { includeCoach: false, rateScale: 0.8 },
    );
    expect(engine.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello.", speed: 0.8 }), expect.anything());
    expect(viEngine.speak).not.toHaveBeenCalled();
  });
});

describe("speakWithBrowserVoice (Plan18)", () => {
  afterEach(async () => {
    await stopSpeech();
    registerEnglishSpeechEngine(null);
    registerEnglishFallbackSpeechEngine(null);
    registerVietnameseSpeechEngine(null);
    registerVietnameseFallbackSpeechEngine(null);
  });

  it("bỏ qua engine AI và ép đúng giọng hệ thống", async () => {
    const ai = createEngine();
    const browser = createEngine();
    registerEnglishSpeechEngine(ai);
    registerEnglishFallbackSpeechEngine(browser);

    const result = await speakWithBrowserVoice({
      text: "Hello",
      lang: "en",
      voiceURI: "Microsoft Ava Online (Natural) - English (United States)",
      rate: 0.8,
    });

    expect(result.ok).toBe(true);
    expect(ai.speak).not.toHaveBeenCalled();
    expect(browser.speak).toHaveBeenCalledWith(
      { text: "Hello", lang: "en", voice: "Microsoft Ava Online (Natural) - English (United States)", speed: 0.8 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("dùng engine trình duyệt của tiếng Việt và không đụng engine tiếng Anh", async () => {
    const english = createEngine();
    const vietnamese = createEngine();
    registerEnglishFallbackSpeechEngine(english);
    registerVietnameseFallbackSpeechEngine(vietnamese);

    await speakWithBrowserVoice({ text: "Xin chào", lang: "vi" });
    expect(english.speak).not.toHaveBeenCalled();
    expect(vietnamese.speak).toHaveBeenCalledTimes(1);
  });

  it("trả unavailable khi chưa có engine trình duyệt hoặc text rỗng", async () => {
    expect(await speakWithBrowserVoice({ text: "Hello", lang: "en" })).toEqual({ ok: false, status: "unavailable" });
    registerEnglishFallbackSpeechEngine(createEngine());
    expect(await speakWithBrowserVoice({ text: "   ", lang: "en" })).toEqual({ ok: false, status: "unavailable" });
  });
});
