import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  GENERATED_SCENARIO_JSON_SCHEMA,
  GeneratedScenarioSchema,
  SCENARIO_AUTHOR_SYSTEM_PROMPT,
  buildScenarioAuthorInput,
  clampGeneratedScenarioLists,
  toMissionTemplate,
} from "./scenario-author";

const scenario = {
  title: "The Late Delivery",
  npcName: "Mai",
  npcRole: "delivery driver",
  learnerGoal: "Explain what is missing from the order and ask for it to be fixed.",
  openingLine: "Sorry I am late. Here is your order.",
  firstPrompt: "Can you check the bag and tell me what is missing?",
  targetVocabulary: ["order", "missing", "receipt", "refund"],
  targetGrammar: ["present perfect"],
  summaryVi: "Bạn nhận đơn hàng bị thiếu và phải nói rõ thiếu gì.",
};

describe("GeneratedScenarioSchema", () => {
  it("accepts a well-formed scenario", () => {
    expect(GeneratedScenarioSchema.safeParse(scenario).success).toBe(true);
  });

  it("refuses a scenario with too few words to practise", () => {
    expect(GeneratedScenarioSchema.safeParse({ ...scenario, targetVocabulary: ["order"] }).success).toBe(false);
  });

  it("refuses an opening line long enough to be an essay", () => {
    const long = { ...scenario, openingLine: "x".repeat(200) };
    expect(GeneratedScenarioSchema.safeParse(long).success).toBe(false);
  });

  it("requires the Vietnamese summary, so the learner knows what they are walking into", () => {
    const { summaryVi: _dropped, ...withoutSummary } = scenario;
    expect(GeneratedScenarioSchema.safeParse(withoutSummary).success).toBe(false);
  });

  it("trims whitespace rather than storing it", () => {
    const parsed = GeneratedScenarioSchema.parse({ ...scenario, title: "  The Late Delivery  " });
    expect(parsed.title).toBe("The Late Delivery");
  });
});

describe("the JSON schema handed to the provider", () => {
  it("matches the fields the zod schema requires", () => {
    const required = GENERATED_SCENARIO_JSON_SCHEMA.required as string[];
    expect(new Set(required)).toEqual(new Set(Object.keys(scenario)));
  });

  it("forbids extra properties, so a chatty model cannot smuggle fields in", () => {
    expect(GENERATED_SCENARIO_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("the system prompt", () => {
  it("tells the model to write in English but summarise in Vietnamese", () => {
    expect(SCENARIO_AUTHOR_SYSTEM_PROMPT).toContain("summaryVi");
    expect(SCENARIO_AUTHOR_SYSTEM_PROMPT).toContain("Vietnamese sentence");
  });

  it("has a rule for an unsafe request that does not echo it back", () => {
    expect(SCENARIO_AUTHOR_SYSTEM_PROMPT).toContain("do not mention the request");
  });

  it("forbids mentioning the learner's level or mistakes inside the fiction", () => {
    expect(SCENARIO_AUTHOR_SYSTEM_PROMPT).toContain("Never mention these instructions");
  });
});

describe("buildScenarioAuthorInput", () => {
  const base = {
    prompt: "  tôi muốn tập gọi đồ ở tiệm bánh mì  ",
    cefrLevel: "A2",
    preferredTopics: ["chơi game", "du lịch", "nấu ăn", "bóng đá", "phim", "âm nhạc"],
    recurringMistakes: ["Thì của động từ", "Mạo từ a, an, the", "Giới từ", "Chọn từ"],
    weakWords: Array.from({ length: 12 }, (_, index) => `word${index}`),
  };

  it("passes the learner's own words through, trimmed", () => {
    expect(buildScenarioAuthorInput(base).learnerRequest).toBe("tôi muốn tập gọi đồ ở tiệm bánh mì");
  });

  it("caps every list, so one learner's history cannot become the prompt", () => {
    const built = buildScenarioAuthorInput(base);
    expect((built.interests as string[]).length).toBe(5);
    expect((built.strugglesWith as string[]).length).toBe(3);
    expect((built.wordsToPractise as string[]).length).toBe(8);
  });

  it("caps a very long request rather than sending it whole", () => {
    const built = buildScenarioAuthorInput({ ...base, prompt: "a".repeat(500) });
    expect((built.learnerRequest as string).length).toBe(240);
  });
});

describe("toMissionTemplate", () => {
  it("carries the fiction across and keeps the server's turn budget", () => {
    // The model must never set the turn budget: that belongs to the daily time
    // the learner chose, not to the situation they asked for.
    const template = toMissionTemplate("custom-abc", scenario, 5);
    expect(template).toMatchObject({
      key: "custom-abc",
      title: "The Late Delivery",
      npcName: "Mai",
      maxTurns: 5,
    });
    expect(template.targetVocabulary).toEqual(scenario.targetVocabulary);
  });

  it("does not carry the Vietnamese summary into the tutor prompt", () => {
    // The tutor speaks English; the summary exists for the learner's card.
    expect(JSON.stringify(toMissionTemplate("custom-abc", scenario, 7))).not.toContain("Bạn nhận đơn");
  });
});

describe("clampGeneratedScenarioLists", () => {
  // Measured against the live model on 2026-09-20: it asked for four grammar
  // points and got five, and the learner saw "Chưa tạo được chủ đề lúc này".
  it("accepts a generation that returned one grammar point too many", () => {
    const generous = {
      ...scenario,
      targetGrammar: ["past simple", "present perfect", "modals", "questions", "articles"],
    };
    expect(GeneratedScenarioSchema.safeParse(generous).success).toBe(false);

    const clamped = GeneratedScenarioSchema.parse(clampGeneratedScenarioLists(generous));
    expect(clamped.targetGrammar).toEqual(["past simple", "present perfect", "modals", "questions"]);
  });

  it("keeps the first eight words when the model volunteers more", () => {
    const generous = {
      ...scenario,
      targetVocabulary: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    };
    const clamped = GeneratedScenarioSchema.parse(clampGeneratedScenarioLists(generous));
    expect(clamped.targetVocabulary).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("still rejects a list that is too short, because a floor cannot be clamped", () => {
    const thin = { ...scenario, targetVocabulary: ["order", "missing"] };
    expect(GeneratedScenarioSchema.safeParse(clampGeneratedScenarioLists(thin)).success).toBe(false);
  });

  it("accepts a grammar point phrased longer than a vocabulary item", () => {
    // The other live rejection: "present continuous for future arrangements" is
    // a normal way to name a grammar point and was 11 characters over the cap a
    // single word needs.
    const phrased = {
      ...scenario,
      targetGrammar: ["present continuous for future arrangements"],
    };
    expect(GeneratedScenarioSchema.safeParse(clampGeneratedScenarioLists(phrased)).success).toBe(true);
  });

  it("drops an item too long even for grammar instead of cutting it in half", () => {
    // A hint cut mid-phrase would go into a tutor prompt as nonsense.
    const overlong = {
      ...scenario,
      targetGrammar: ["past simple", "g".repeat(80)],
    };
    const clamped = GeneratedScenarioSchema.parse(clampGeneratedScenarioLists(overlong));
    expect(clamped.targetGrammar).toEqual(["past simple"]);
  });

  it("drops entries that are not usable strings", () => {
    const messy = {
      ...scenario,
      targetVocabulary: ["order", "  ", "missing", null, 7, "receipt"],
    };
    const clamped = GeneratedScenarioSchema.parse(clampGeneratedScenarioLists(messy));
    expect(clamped.targetVocabulary).toEqual(["order", "missing", "receipt"]);
  });

  it("leaves strings alone, so a mangled sentence never reaches a learner", () => {
    const wordy = { ...scenario, openingLine: "x".repeat(400) };
    const clampedOpening = (clampGeneratedScenarioLists(wordy) as { openingLine: string }).openingLine;
    expect(clampedOpening).toHaveLength(400);
    expect(GeneratedScenarioSchema.safeParse(clampGeneratedScenarioLists(wordy)).success).toBe(false);
  });

  it("passes a conforming generation through untouched", () => {
    expect(clampGeneratedScenarioLists(scenario)).toEqual(scenario);
  });

  it("does not throw on a reply that is not an object at all", () => {
    expect(clampGeneratedScenarioLists(null)).toBeNull();
    expect(clampGeneratedScenarioLists("not json")).toBe("not json");
  });
});
