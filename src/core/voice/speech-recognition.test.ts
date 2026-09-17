import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserRecognizer,
  describeVoiceInputError,
  isSpeechRecognitionSupported,
  mapRecognitionError,
  VoiceInputError,
} from "./speech-recognition";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  }
  emit(transcript: string, isFinal: boolean, confidence = 0.8) {
    const item = { isFinal, length: 1, 0: { transcript, confidence } };
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: item } });
  }
}

afterEach(() => {
  FakeRecognition.instances = [];
  vi.unstubAllGlobals();
});

describe("speech recognition wrapper", () => {
  it("reports no support without a window recogniser", () => {
    vi.stubGlobal("window", {});
    expect(isSpeechRecognitionSupported()).toBe(false);
    expect(createBrowserRecognizer()).toBeNull();
  });

  it("resolves the final transcript with interim updates and one-shot settings", async () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    const recognizer = createBrowserRecognizer();
    expect(recognizer).not.toBeNull();
    const interim = vi.fn();
    const pending = recognizer!.start({ lang: "en-US", onInterim: interim });
    const fake = FakeRecognition.instances[0];
    expect(fake.lang).toBe("en-US");
    expect(fake.continuous).toBe(false);
    expect(fake.interimResults).toBe(true);
    fake.emit("my suit", false);
    fake.emit("my suitcase is black", true, 0.91);
    fake.stop();
    await expect(pending).resolves.toEqual({
      transcript: "my suitcase is black",
      confidence: 0.91,
      alternatives: ["my suitcase is black"],
    });
    expect(interim).toHaveBeenCalledWith("my suit");
  });

  it("rejects with a typed error when the browser reports one", async () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
    const recognizer = createBrowserRecognizer()!;
    const pending = recognizer.start({ lang: "en-US" });
    const fake = FakeRecognition.instances[0];
    fake.onerror?.({ error: "not-allowed" });
    fake.onend?.();
    await expect(pending).rejects.toMatchObject({ code: "not-allowed" });
  });

  it("treats silence as no-speech and an external abort as aborted", async () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
    const recognizer = createBrowserRecognizer()!;
    const silent = recognizer.start({ lang: "en-US" });
    FakeRecognition.instances[0].stop();
    await expect(silent).rejects.toBeInstanceOf(VoiceInputError);
    await expect(silent).rejects.toMatchObject({ code: "no-speech" });

    const controller = new AbortController();
    const aborted = recognizer.start({ lang: "en-US", signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: "aborted" });
  });

  it("maps browser error codes and describes them in Vietnamese", () => {
    expect(mapRecognitionError("service-not-allowed")).toBe("not-allowed");
    expect(mapRecognitionError("network")).toBe("network");
    expect(mapRecognitionError("something-else")).toBe("failed");
    expect(describeVoiceInputError("unsupported")).toMatch(/Chrome, Edge hoặc Safari/);
    expect(describeVoiceInputError("not-allowed")).toMatch(/micro/);
  });
});
