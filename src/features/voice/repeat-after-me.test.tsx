import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RepeatAfterMe } from "./repeat-after-me";
import { VoiceInputButton } from "./voice-input-button";

vi.mock("@/core/tts/speech", () => ({ speak: vi.fn(), speakCurated: vi.fn(), stopSpeech: vi.fn() }));

describe("voice components (static render)", () => {
  it("renders the model line with a listen button and no microphone on the server", () => {
    const html = renderToStaticMarkup(<RepeatAfterMe line="I lost my bag." sessionId="s-1" />);
    expect(html).toContain("Nghe mẫu");
    expect(html).toContain("I lost my bag.");
    expect(html).toContain('data-repeat-line="I lost my bag."');
    // The recogniser is unknown during SSR, so the mic is absent (hydration-safe).
    expect(html).not.toContain("Nói lại");
  });

  it("renders the unsupported fallback instead of a microphone on the server", () => {
    const html = renderToStaticMarkup(
      <VoiceInputButton onTranscript={() => undefined} unsupportedFallback={<span>typed only</span>} />,
    );
    expect(html).toContain("typed only");
    expect(html).not.toContain("Nói để trả lời");
  });
});
