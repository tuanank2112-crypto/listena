import { describe, expect, it } from "vitest";
import {
  PERSONALIZED_LESSON_JSON_SCHEMA,
  PersonalizedLessonDraftSchema,
  toStoredPersonalizedLesson,
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

  it("marks every strict-schema property required and uses nullable optional fields", () => {
    const vocabularySchema = PERSONALIZED_LESSON_JSON_SCHEMA.properties.vocabulary.items as {
      required: readonly string[];
    };
    const exerciseSchema = PERSONALIZED_LESSON_JSON_SCHEMA.properties.exercises.items as {
      required: readonly string[];
    };
    expect(vocabularySchema.required).toContain("ipa");
    expect(vocabularySchema.required).toContain("exampleSentence");
    expect(exerciseSchema.required).toContain("options");
  });
});
