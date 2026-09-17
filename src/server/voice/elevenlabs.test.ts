import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  DEFAULT_MODEL_EN,
  DEFAULT_MODEL_VI,
  ElevenLabsError,
  getCuratedVoiceCatalogue,
  resetElevenLabsCaches,
  resolveElevenLabsConfig,
  resolveVoiceId,
  synthesizeSpeech,
} from "./elevenlabs";

const originalFetch = global.fetch;
const fetchMock = vi.fn();

const voicesPayload = {
  voices: [
    { voice_id: "TALIAxxxxxxxxxxxxxxx", name: "Talia - Warm Soft Guide", category: "premade", labels: { accent: "American", gender: "female", age: "young" } },
    { voice_id: "FINLEYxxxxxxxxxxxxxx", name: "Finley - Articulate Anchor", category: "premade", labels: { accent: "American", gender: "male", age: "middle-aged" } },
    { voice_id: "ELDRINxxxxxxxxxxxxxx", name: "Eldrin - Crisp British Baritone", category: "premade", labels: { accent: "British", gender: "male" } },
  ],
  has_more: false,
};

function config(overrides: Record<string, string> = {}) {
  return resolveElevenLabsConfig({ ELEVENLABS_API_KEY: "k".repeat(20), ...overrides })!;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetElevenLabsCaches();
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("ElevenLabs config", () => {
  it("fails closed without a key and applies model/voice overrides", () => {
    expect(resolveElevenLabsConfig({})).toBeNull();
    expect(resolveElevenLabsConfig({ ELEVENLABS_API_KEY: "  " })).toBeNull();
    const resolved = config({ ELEVENLABS_MODEL_VI: "eleven_v3", ELEVENLABS_VOICE_EN_GB: "ELDRINxxxxxxxxxxxxxx", ELEVENLABS_VOICE_VI: "bad id!" });
    expect(resolved.modelEn).toBe(DEFAULT_MODEL_EN);
    expect(resolved.modelVi).toBe("eleven_v3");
    expect(resolved.voiceOverrides["en-GB"]).toBe("ELDRINxxxxxxxxxxxxxx");
    expect(resolved.voiceOverrides.vi).toBeUndefined();
    expect(DEFAULT_MODEL_VI).toBe("eleven_flash_v2_5");
  });
});

describe("catalogue", () => {
  it("lists premade voices with the key header, ranks them and caches for an hour", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(voicesPayload), { status: 200 }));
    const catalogue = await getCuratedVoiceCatalogue(config(), 1_000);
    expect(catalogue["en-US"][0]?.name).toBe("Talia");
    expect(catalogue["en-GB"][0]?.name).toBe("Eldrin");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v2/voices?page_size=100&category=premade");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k".repeat(20));
    await getCuratedVoiceCatalogue(config(), 2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps upstream failures to typed errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await expect(getCuratedVoiceCatalogue(config())).rejects.toMatchObject({ code: "unauthorized", status: 503 });
  });
});

describe("synthesizeSpeech", () => {
  it("posts the curated voice with the English model, bounded settings and returns audio", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(voicesPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const output = await synthesizeSpeech(config(), { text: "  Hello   there.  ", lang: "en", accent: "en-US", speed: 5 });
    expect(output).toMatchObject({ voiceId: "TALIAxxxxxxxxxxxxxxx", model: DEFAULT_MODEL_EN, cached: false, contentType: "audio/mpeg" });
    expect(Array.from(output.audio)).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/TALIAxxxxxxxxxxxxxxx?output_format=mp3_44100_64");
    expect(JSON.parse(init.body as string)).toMatchObject({
      text: "Hello there.",
      model_id: DEFAULT_MODEL_EN,
      language_code: "en",
      voice_settings: { speed: 1.2, stability: 0.55 },
    });
  });

  it("serves a repeated utterance from the in-memory cache", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(voicesPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200 }));
    await synthesizeSpeech(config(), { text: "Again.", lang: "en" });
    const second = await synthesizeSpeech(config(), { text: "Again.", lang: "en" });
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the Vietnamese model and a neutral fallback voice for vi", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(voicesPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
    const output = await synthesizeSpeech(config(), { text: "Xin chào.", lang: "vi" });
    expect(output.model).toBe(DEFAULT_MODEL_VI);
    expect(output.voiceId).toBe("TALIAxxxxxxxxxxxxxxx");
  });

  it("rejects voices outside the curated list, empty and oversized text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(voicesPayload), { status: 200 }));
    await expect(resolveVoiceId(config(), { lang: "en", voiceId: "NOTALLOWEDxxxxxxxxxx" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(synthesizeSpeech(config(), { text: "   ", lang: "en" })).rejects.toBeInstanceOf(ElevenLabsError);
    await expect(synthesizeSpeech(config(), { text: "x".repeat(601), lang: "en" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("honours an env override without consulting the catalogue ranking", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(voicesPayload), { status: 200 }));
    await expect(resolveVoiceId(config({ ELEVENLABS_VOICE_EN_US: "CUSTOMxxxxxxxxxxxxxx" }), { lang: "en", accent: "en-US" })).resolves.toBe("CUSTOMxxxxxxxxxxxxxx");
  });

  it("maps 429 with Retry-After and 5xx to typed errors", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(voicesPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "7" } }));
    await expect(synthesizeSpeech(config(), { text: "Hi.", lang: "en" })).rejects.toMatchObject({ code: "rate_limited", status: 429, retryAfterSeconds: 7 });
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(synthesizeSpeech(config(), { text: "Hi again.", lang: "en" })).rejects.toMatchObject({ code: "upstream", status: 502 });
  });
});
