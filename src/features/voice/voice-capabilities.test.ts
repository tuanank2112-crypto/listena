import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVoiceCapabilities, loadVoiceCapabilities, resetVoiceCapabilitiesForTests } from "./voice-capabilities";

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  resetVoiceCapabilitiesForTests();
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("voice capabilities", () => {
  it("probes once, publishes the catalogue and reuses the result", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ enabled: true, models: { en: "m2", vi: "flash" }, voices: { "en-US": [{ id: "a" }], "en-GB": [], vi: [] } }), { status: 200 }));
    const first = await loadVoiceCapabilities();
    expect(first).toMatchObject({ status: "ready", aiVoice: true, models: { en: "m2" } });
    await loadVoiceCapabilities();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getVoiceCapabilities().voices["en-US"]).toHaveLength(1);
  });

  it("treats 401, errors and network failures as no AI voice", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    expect(await loadVoiceCapabilities()).toMatchObject({ status: "ready", aiVoice: false });
    resetVoiceCapabilitiesForTests();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await loadVoiceCapabilities()).toMatchObject({ status: "error", aiVoice: false });
  });

  it("dedupes concurrent probes", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ enabled: false, voices: { "en-US": [], "en-GB": [], vi: [] } }), { status: 200 }));
    await Promise.all([loadVoiceCapabilities(), loadVoiceCapabilities()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
