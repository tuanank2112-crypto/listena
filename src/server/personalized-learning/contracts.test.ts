import { describe, expect, it } from "vitest";
import {
  PersonalizedLessonAttemptInputSchema,
  PERSONALIZED_LESSON_JSON_SCHEMA,
  PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS,
  PersonalizedLessonDraftSchema,
  normalizePersonalizedLessonDraft,
  summarizeZodIssues,
  toStoredPersonalizedLesson,
  trimTranscript,
} from "@/server/personalized-learning/contracts";

const draft = {
  title: "A travel plan built for you",
  targetSkill: "vocabulary",
  cefrLevel: "A2",
  difficulty: 1.1,
  objectives: ["Use travel words in a short exchange", "Spell target vocabulary"],
  introVi: "Hôm nay em sẽ luyện các từ cần dùng khi lập kế hoạch đi chơi.",
  transcript: "Mai plans a short weekend trip and checks the train timetable before booking a ticket.",
  vocabulary: [
    { lemma: "timetable", displayText: "timetable", meaningVi: "thời gian biểu", cefrLevel: "A2", isTarget: true, importance: 1 },
    { lemma: "ticket", displayText: "ticket", meaningVi: "vé", cefrLevel: "A2", isTarget: true, importance: 1 },
    { lemma: "book", displayText: "book", meaningVi: "đặt chỗ", cefrLevel: "A2", isTarget: true, importance: 1 },
    { lemma: "trip", displayText: "trip", meaningVi: "chuyến đi", cefrLevel: "A2", isTarget: true, importance: 1 },
  ],
  exercises: [
    { id: "exercise-1", type: "CHOICE", prompt: "Choose ticket", options: ["ticket", "trip"], answer: "ticket", feedbackVi: "Ticket là vé." },
    { id: "exercise-2", type: "SPELL", prompt: "Spell trip", answer: "trip", feedbackVi: "Trip là chuyến đi." },
    { id: "exercise-3", type: "FILL", prompt: "Fill book", answer: ["book", "books"], feedbackVi: "Book là đặt chỗ." },
    { id: "exercise-4", type: "CHOICE", prompt: "Choose timetable", options: ["timetable", "ticket"], answer: "timetable", feedbackVi: "Timetable là thời gian biểu." },
  ],
};

describe("personalized lesson contract", () => {
  it("separates answer validators from the owner-facing lesson content", () => {
    const parsed = PersonalizedLessonDraftSchema.parse(draft);
    const stored = toStoredPersonalizedLesson(parsed, [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ]);

    expect(JSON.stringify(stored.content)).not.toContain('"answer"');
    expect(JSON.stringify(stored.content)).not.toContain('"feedbackVi"');
    expect(stored.validator.exercises[0]?.acceptedAnswers).toEqual(["ticket"]);
  });

  it("rejects a choice whose answer is not present in options", () => {
    expect(
      PersonalizedLessonDraftSchema.safeParse({
        ...draft,
        exercises: [
          { ...draft.exercises[0], answer: "not an option" },
          ...draft.exercises.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects output that would normalize into an unusable shared vocabulary key", () => {
    expect(
      PersonalizedLessonDraftSchema.safeParse({
        ...draft,
        vocabulary: [{ ...draft.vocabulary[0], lemma: "***" }, ...draft.vocabulary.slice(1)],
      }).success,
    ).toBe(false);
  });

  it("accepts strict-provider null placeholders but never exposes them as answer data", () => {
    const parsed = PersonalizedLessonDraftSchema.parse({
      ...draft,
      vocabulary: draft.vocabulary.map((word) => ({
        ...word,
        ipa: null,
        meaningEn: null,
        partOfSpeech: null,
        exampleSentence: null,
      })),
      exercises: draft.exercises.map((exercise) => ({
        ...exercise,
        options: exercise.options ?? null,
      })),
    });
    const stored = toStoredPersonalizedLesson(parsed, [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ]);

    expect(stored.content.exercises[1]).not.toHaveProperty("options");
    expect(JSON.stringify(stored.content)).not.toContain('"answer"');
  });

  // Plan13 SPEC-P131 §4: the compact contract that fits under the gateway timeout.
  it("does not require the optional vocabulary fields so the provider can omit them", () => {
    const vocabularySchema = PERSONALIZED_LESSON_JSON_SCHEMA.properties.vocabulary.items as {
      required: readonly string[];
    };
    const exerciseSchema = PERSONALIZED_LESSON_JSON_SCHEMA.properties.exercises.items as {
      required: readonly string[];
    };
    for (const optional of ["ipa", "meaningEn", "partOfSpeech", "exampleSentence"]) {
      expect(vocabularySchema.required).not.toContain(optional);
    }
    expect(vocabularySchema.required).toEqual(expect.arrayContaining(["lemma", "displayText", "meaningVi", "cefrLevel"]));
    expect(exerciseSchema.required).toContain("options");
    // Omitted optional fields still parse.
    expect(PersonalizedLessonDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("bounds the draft to 4-5 words, exactly 4 exercises and a 700-character transcript", () => {
    expect(PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS).toBe(1_400);
    const fifthWord = { lemma: "station", displayText: "station", meaningVi: "nhà ga", cefrLevel: "A2", isTarget: true, importance: 1 };
    expect(PersonalizedLessonDraftSchema.safeParse({ ...draft, vocabulary: [...draft.vocabulary, fifthWord] }).success).toBe(true);
    expect(PersonalizedLessonDraftSchema.safeParse({
      ...draft,
      vocabulary: [...draft.vocabulary, fifthWord, { ...fifthWord, lemma: "platform", displayText: "platform" }],
    }).success).toBe(false);
    expect(PersonalizedLessonDraftSchema.safeParse({
      ...draft,
      exercises: [...draft.exercises, { id: "exercise-5", type: "SPELL", prompt: "Spell station", answer: "station", feedbackVi: "Station là nhà ga." }],
    }).success).toBe(false);
    expect(PersonalizedLessonDraftSchema.safeParse({ ...draft, exercises: draft.exercises.slice(0, 3) }).success).toBe(false);
    expect(PersonalizedLessonDraftSchema.safeParse({ ...draft, transcript: "Mai ".repeat(180) }).success).toBe(false);
    expect(PersonalizedLessonDraftSchema.safeParse({ ...draft, transcript: "Mai ".repeat(170).trim() }).success).toBe(true);
  });
});

describe("personalized attempt input (Plan13 P133 Answer Canvas fields)", () => {
  const base = { exerciseId: "exercise-1", answer: "ticket", clientAttemptId: "client-attempt-1" };

  it("defaults hintCount to 0 and leaves confidence/assistMode undefined", () => {
    expect(PersonalizedLessonAttemptInputSchema.parse(base)).toMatchObject({ hintCount: 0 });
    expect(PersonalizedLessonAttemptInputSchema.parse(base)).not.toHaveProperty("confidence");
  });

  it("accepts the canvas fields and rejects out-of-range values", () => {
    expect(PersonalizedLessonAttemptInputSchema.parse({ ...base, hintCount: 3, confidence: 2, assistMode: "SKELETON" }))
      .toMatchObject({ hintCount: 3, confidence: 2, assistMode: "SKELETON" });
    expect(PersonalizedLessonAttemptInputSchema.safeParse({ ...base, hintCount: 21 }).success).toBe(false);
    expect(PersonalizedLessonAttemptInputSchema.safeParse({ ...base, confidence: 4 }).success).toBe(false);
    expect(PersonalizedLessonAttemptInputSchema.safeParse({ ...base, assistMode: "MIC" }).success).toBe(false);
  });
});


// Plan13 follow-up: lenient shape repair before strict validation.
describe("normalizePersonalizedLessonDraft", () => {
  it("turns an oversized, oddly numbered provider draft into a valid compact draft", () => {
    const extraWord = (lemma: string) => ({ lemma, displayText: lemma, meaningVi: "x", cefrLevel: "A2" });
    const oversized = {
      ...draft,
      vocabulary: [...draft.vocabulary, extraWord("station"), extraWord("platform"), extraWord("delay")],
      exercises: [
        { ...draft.exercises[0], id: "ex1", type: "choice" },
        { ...draft.exercises[1], id: "exercise-7", options: null },
        { ...draft.exercises[2], id: "3", options: ["a", "b"] },
        { ...draft.exercises[3], id: "exercise-4", options: ["timetable", "ticket", ""] },
        { id: "exercise-5", type: "SPELL", prompt: "Spell delay", answer: "delay", feedbackVi: "Delay la tre." },
      ],
    };
    expect(PersonalizedLessonDraftSchema.safeParse(oversized).success).toBe(false);
    const parsed = PersonalizedLessonDraftSchema.safeParse(normalizePersonalizedLessonDraft(oversized));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.vocabulary).toHaveLength(5);
    expect(parsed.data.exercises.map((exercise) => exercise.id)).toEqual(["exercise-1", "exercise-2", "exercise-3", "exercise-4"]);
    expect(parsed.data.exercises[0]?.type).toBe("CHOICE");
    expect(parsed.data.exercises[2]).not.toHaveProperty("options");
    expect(parsed.data.exercises[2]?.answer).toEqual(["book", "books"]);
    expect(parsed.data.exercises[3]?.options).toEqual(["timetable", "ticket"]);
    expect(parsed.data.vocabulary[4]).toMatchObject({ isTarget: true, importance: 1, ipa: null, exampleSentence: null });
  });

  it("trims an over-long transcript at the last sentence boundary", () => {
    const sentence = "Mai checks the timetable before she buys a ticket for the trip. ";
    const long = sentence.repeat(20);
    const normalized = normalizePersonalizedLessonDraft({ ...draft, transcript: long }) as { transcript: string };
    expect(normalized.transcript.length).toBeLessThanOrEqual(700);
    expect(normalized.transcript.endsWith("trip.")).toBe(true);
    expect(normalized.transcript.length).toBe(sentence.trim().length * 10 + 9);
    expect(trimTranscript("word ".repeat(200), 700).length).toBeLessThanOrEqual(700);
    expect(trimTranscript("short.", 700)).toBe("short.");
    expect(PersonalizedLessonDraftSchema.safeParse({ ...normalized }).success).toBe(true);
  });

  it("keeps missing optional vocabulary fields valid and summarizes Zod issues without values", () => {
    const bare = { ...draft, vocabulary: draft.vocabulary.map(({ lemma, displayText, meaningVi, cefrLevel }) => ({ lemma, displayText, meaningVi, cefrLevel })) };
    expect(PersonalizedLessonDraftSchema.safeParse(normalizePersonalizedLessonDraft(bare)).success).toBe(true);
    const broken = PersonalizedLessonDraftSchema.safeParse(normalizePersonalizedLessonDraft({ ...draft, exercises: draft.exercises.map((exercise, index) => index === 2 ? { ...exercise, answer: "" } : exercise) }));
    expect(broken.success).toBe(false);
    if (broken.success) return;
    const summary = summarizeZodIssues(broken.error.issues);
    expect(summary.startsWith("zod:exercises.2.answer:")).toBe(true);
    expect(summary).not.toContain("book");
  });
});
