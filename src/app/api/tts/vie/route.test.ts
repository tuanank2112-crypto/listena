import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn } }));

import { GET, POST } from "./route";

const originalFetch = global.fetch;
const fetchMock = vi.fn();

function request(body: unknown) {
  return new NextRequest("http://localhost/api/tts/vie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedRequest() {
  return new NextRequest("http://localhost/api/tts/vie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock;
  vi.stubEnv("TTS_API_KEY", "");
  vi.stubEnv("VIENEU_URL", "");
  vi.stubEnv("VIENEU_DEFAULT_VOICE", "");
  mocks.auth.mockResolvedValue({ user: { id: "learner-one" } });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("VieNeu TTS route", () => {
  it("rejects unauthenticated requests before parsing or sidecar fetches", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the shared sidecar key is absent", async () => {
    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies before network work", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");

    const response = await POST(request({ text: "", speed: 4 }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before network work", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");

    const response = await POST(malformedRequest());

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves an omitted voice at runtime, forwards the key, and returns private audio", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");
    vi.stubEnv("VIENEU_URL", "http://sidecar.internal");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "vn-default", description: "Default" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-TTS-Voice")).toBe("vn-default");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://sidecar.internal/voices", expect.objectContaining({
      headers: { "X-TTS-Key": "shared-key" },
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://sidecar.internal/tts", expect.objectContaining({
      headers: { "Content-Type": "application/json", "X-TTS-Key": "shared-key" },
    }));
    expect(response.headers.get("X-TTS-Cache")).toBe("BYPASS");
  });

  it("returns audio without attempting a local filesystem cache", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");
    vi.stubEnv("VIENEU_DEFAULT_VOICE", "vn-default");
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-TTS-Cache")).toBe("BYPASS");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps unavailable sidecar responses to a bounded upstream error", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");
    vi.stubEnv("VIENEU_DEFAULT_VOICE", "vn-default");
    fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps rejected sidecar requests to a bounded upstream error", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");
    vi.stubEnv("VIENEU_DEFAULT_VOICE", "vn-default");
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));

    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(502);
  });

  it("returns generated audio directly from the sidecar", async () => {
    vi.stubEnv("TTS_API_KEY", "shared-key");
    vi.stubEnv("VIENEU_DEFAULT_VOICE", "vn-default");
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const response = await POST(request({ text: "xin chào" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-TTS-Cache")).toBe("BYPASS");
  });

  it("protects voice discovery with the same authentication boundary", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
