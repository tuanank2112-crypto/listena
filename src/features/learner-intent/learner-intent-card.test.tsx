import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearnerIntentCard } from "./learner-intent-card";

describe("LearnerIntentCard", () => {
  it("renders an accessible, editable intent form from the typed snapshot", () => {
    const html = renderToStaticMarkup(
      <LearnerIntentCard
        initialIntent={{
          goal: "Speak with more confidence while travelling",
          dailyMinutes: 10,
          preferredTopics: ["Travel"],
          revision: "snapshot-1",
        }}
      />,
    );

    expect(html).toContain('id="learner-intent-goal"');
    expect(html).toContain('name="learner-daily-minutes"');
    expect(html).toContain('aria-label="Chủ đề đã chọn"');
    expect(html).toContain("Speak with more confidence while travelling");
    expect(html).toContain("Lưu mục tiêu học");
  });
});
