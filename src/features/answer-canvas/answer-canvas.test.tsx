import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnswerCanvas } from "./answer-canvas";

vi.mock("@/core/tts/speech", () => ({ speak: vi.fn(), speakCurated: vi.fn() }));

const noop = async () => ({ mode: "SKELETON" as const, hintCost: 1 });

describe("AnswerCanvas (static render)", () => {
  it("renders FREE mode with the #answer input, assist tabs, confidence stars and submit", () => {
    const html = renderToStaticMarkup(
      <AnswerCanvas exerciseKey="ex-1" hasAudio allowAssist fetchAssist={noop} onSubmit={() => undefined} />,
    );
    expect(html).toContain('id="answer"');
    expect(html).toContain('data-canvas-mode="FREE"');
    expect(html).toContain("Mở khung");
    expect(html).toContain("Lấy mảnh");
    expect(html).toContain("Đoán trước khi nghe");
    expect(html).toContain('aria-label="Cược tự tin"');
    expect(html).toContain("3 sao — Rất chắc");
    expect(html).toContain("Kiểm tra");
    // Nothing that could leak an answer is rendered before an assist call.
    expect(html).not.toContain('aria-label="Mảnh chữ"');
    expect(html).not.toContain('aria-label="Khung từ"');
  });

  it("hides assist and predict affordances for open answers without audio and mirrors submitting", () => {
    const html = renderToStaticMarkup(
      <AnswerCanvas
        exerciseKey="ex-2"
        hasAudio={false}
        allowAssist={false}
        fetchAssist={noop}
        onSubmit={() => undefined}
        submitting
        secondaryAction={<button type="button">Tiếp</button>}
      />,
    );
    expect(html).not.toContain("Mở khung");
    expect(html).not.toContain("Lấy mảnh");
    expect(html).not.toContain("Đoán trước khi nghe");
    expect(html).toContain("Đang chấm…");
    expect(html).toContain(">Tiếp</button>");
  });
});
