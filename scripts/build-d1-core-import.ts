/**
 * Build a reviewed, additive SQL import for the tracked TATQHP1 curriculum.
 *
 * This script never opens a database. It validates the source snapshot and
 * writes SQL only to an explicit output path, so production writes remain an
 * intentional `wrangler d1 execute --remote --file ...` operation.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../dataset/manifest.json";
import lessonsData from "../dataset/lessons.json";
import vocabularyData from "../dataset/vocabulary.json";
import grammarData from "../dataset/grammar-reference.json";
import exercisesData from "../dataset/exercises.json";

const COURSE_ID = stableId("listena:course:tatqhp1-solutions-pre-intermediate");
const SYSTEM_USER_ID = stableId("listena:system-user:core-curriculum");
const SYSTEM_EMAIL = "system-curriculum@listena.invalid";
const SYSTEM_PASSWORD_HASH = "$2a$12$Xc0NExYQdyHECrP4wrPB7ekhFVyAXQEZuhp.8cFfbR2/u9HobsAzK";
const COURSE_TITLE = "TATQHP1 - SOLUTIONS Pre-Intermediate";
const DATASET_SOURCE = "Sách HDH TATQHP1 SOLUTIONS đã chỉnh sửa theo ý kiến hội đồng lần 2.docx";

type LessonSource = {
  id: string;
  unit: number;
  title: string;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  topic: string;
  learningObjectives: string[];
  exerciseCount: number;
  grammarIds: string[];
};

type VocabularySource = {
  lemma: string;
  displayText: string;
  ipa?: string | null;
  meaningVi?: string | null;
  meaningEn?: string | null;
  partOfSpeech?: string | null;
  exampleSentence?: string | null;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  unit: number;
};

type GrammarSource = { id: string; unit: number; title: string; content: string };
type ExerciseSource = { number: number; title: string; content: string[]; answers: string[] };
type ExerciseUnit = { unit: number; exercises: ExerciseSource[] };

function stableId(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sql(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Dataset contains a non-finite number");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value.includes("\u0000")) throw new Error("Dataset contains a NUL character");
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function cleanMeaning(value: string | null | undefined, exampleSentence?: string | null): string {
  let meaning = (value || "").trim();
  if (exampleSentence) meaning = meaning.replace(exampleSentence, "").trim();
  meaning = meaning.split(/\s+(?=(?:I|He|She|We|They|It|There|The|My|Our|People|Students|A lot of)\b)/)[0]?.trim() || meaning;
  return meaning.replace(/[.\s]+$/, "") || "Nghĩa đang được bổ sung";
}

function normalizeSourceText(value: string): string {
  return value
    .replace(/\bicy hockey\b/gi, "ice hockey")
    .replace(/\billgal\b/gi, "illegal")
    .replace(/\bscience fiction fim\b/gi, "science fiction film")
    .replace(/\bcolcanic eruption\b/gi, "volcanic eruption")
    .replace(/\bpresent continous\b/gi, "present continuous")
    .trim();
}

function inferExerciseType(title: string, exerciseNumber: number): "VOCABULARY" | "GIST" {
  const normalized = title.toLowerCase();
  return exerciseNumber <= 4 || /vocabulary|word|adjective|film|programme|weather/.test(normalized)
    ? "VOCABULARY"
    : "GIST";
}

function inferAnswerMode(title: string): "open" | "guided" {
  return /^(writing|speaking) practice|with your own words|short paragraph/i.test(title)
    ? "open"
    : "guided";
}

function lessonTranscript(lesson: LessonSource, grammar: GrammarSource[]): string {
  return [
    lesson.title,
    ...lesson.learningObjectives.slice(0, 4),
    ...grammar.map((topic) => `${topic.title}. ${topic.content.slice(0, 800)}`),
  ].join("\n\n");
}

function parseOutputPath(): string {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output || output.startsWith("--")) {
    throw new Error("Usage: npm run dataset:build-d1-import -- --output <temporary .sql path>");
  }
  return path.resolve(process.cwd(), output);
}

function validateDataset(
  lessons: LessonSource[],
  vocabulary: VocabularySource[],
  grammar: GrammarSource[],
  exerciseUnits: ExerciseUnit[],
) {
  const expected = manifest.totals;
  const exerciseCount = exerciseUnits.reduce((total, unit) => total + unit.exercises.length, 0);
  if (lessons.length !== expected.lessons || vocabulary.length !== expected.vocabulary || exerciseCount !== expected.exerciseSets) {
    throw new Error(
      `MANIFEST_MISMATCH: expected ${expected.lessons}/${expected.vocabulary}/${expected.exerciseSets}, got ${lessons.length}/${vocabulary.length}/${exerciseCount}`,
    );
  }
  if (grammar.length !== expected.grammarTopics) {
    throw new Error(`MANIFEST_MISMATCH: expected ${expected.grammarTopics} grammar topics, got ${grammar.length}`);
  }
  for (const lesson of lessons) {
    const unitExercises = exerciseUnits.find((unit) => unit.unit === lesson.unit)?.exercises;
    if (!unitExercises || unitExercises.length !== lesson.exerciseCount) {
      throw new Error(`INVALID_DATASET_VALUE: unit ${lesson.unit} exercise count is inconsistent`);
    }
    if (!lesson.grammarIds.every((id) => grammar.some((topic) => topic.id === id && topic.unit === lesson.unit))) {
      throw new Error(`INVALID_DATASET_VALUE: unit ${lesson.unit} references missing grammar`);
    }
  }
  for (const item of vocabulary) {
    if (!item.lemma.trim() || !item.displayText.trim() || !lessons.some((lesson) => lesson.unit === item.unit)) {
      throw new Error(`INVALID_DATASET_VALUE: vocabulary '${item.lemma}' has invalid unit or text`);
    }
  }
}

function buildSql(input: {
  lessons: LessonSource[];
  vocabulary: VocabularySource[];
  grammar: GrammarSource[];
  exerciseUnits: ExerciseUnit[];
}): string {
  const sourceHash = createHash("sha256")
    .update(JSON.stringify({ manifest, lessons: input.lessons, vocabulary: input.vocabulary, grammar: input.grammar, exercises: input.exerciseUnits }))
    .digest("hex");
  const statements: string[] = [
    "-- Generated by scripts/build-d1-core-import.ts. Do not edit this artifact.",
    `-- Dataset SHA-256: ${sourceHash}`,
    // Cloudflare D1 rejects SQL BEGIN/COMMIT in files executed by Wrangler.
    // Every statement below is independently idempotent, so a transient failure
    // can be safely retried without deleting or replacing existing learner data.
    `INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (${sql(SYSTEM_USER_ID)}, ${sql("ListenAI Curriculum System")}, ${sql(SYSTEM_EMAIL)}, ${sql(SYSTEM_PASSWORD_HASH)}, 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT("email") DO NOTHING;`,
    `INSERT INTO "Course" ("id", "title", "description", "cefrLevel", "status", "createdById", "createdAt", "updatedAt") VALUES (${sql(COURSE_ID)}, ${sql(COURSE_TITLE)}, ${sql("Verified TATQHP1 core curriculum imported from the tracked source dataset." )}, 'A2', 'PUBLISHED', (SELECT "id" FROM "User" WHERE "email" = ${sql(SYSTEM_EMAIL)}), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT("id") DO UPDATE SET "title" = excluded."title", "description" = excluded."description", "cefrLevel" = excluded."cefrLevel", "status" = excluded."status", "updatedAt" = CURRENT_TIMESTAMP;`,
  ];

  for (const item of input.vocabulary) {
    const lemma = item.lemma.trim().toLowerCase();
    statements.push(
      `INSERT INTO "VocabularyItem" ("id", "lemma", "displayText", "ipa", "meaningVi", "meaningEn", "partOfSpeech", "cefrLevel", "exampleSentence", "audioUrl") VALUES (${sql(stableId(`listena:tatqhp1:vocabulary:${lemma}`))}, ${sql(lemma)}, ${sql(item.displayText.trim())}, ${sql(item.ipa?.trim() || null)}, ${sql(cleanMeaning(item.meaningVi, item.exampleSentence))}, ${sql(item.meaningEn?.trim() || null)}, ${sql(item.partOfSpeech?.trim() || null)}, ${sql(item.cefrLevel)}, ${sql(item.exampleSentence?.trim() || null)}, NULL) ON CONFLICT("lemma") DO NOTHING;`,
    );
  }

  for (const lesson of input.lessons) {
    const lessonId = stableId(`listena:tatqhp1:lesson:${lesson.id}`);
    const grammar = input.grammar.filter((topic) => topic.unit === lesson.unit);
    const transcript = lessonTranscript(lesson, grammar);
    statements.push(
      `INSERT INTO "Lesson" ("id", "courseId", "title", "topic", "cefrLevel", "learningObjectives", "transcript", "audioUrl", "accent", "defaultPlaybackRate", "estimatedMinutes", "status", "createdById", "reviewedById", "createdAt", "updatedAt") VALUES (${sql(lessonId)}, ${sql(COURSE_ID)}, ${sql(lesson.title)}, ${sql(lesson.topic)}, ${sql(lesson.cefrLevel)}, ${sql(lesson.learningObjectives.join("\n"))}, ${sql(transcript)}, NULL, 'uk', 1, ${sql(Math.max(15, lesson.exerciseCount * 2))}, 'PUBLISHED', (SELECT "id" FROM "User" WHERE "email" = ${sql(SYSTEM_EMAIL)}), NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT("id") DO UPDATE SET "title" = excluded."title", "topic" = excluded."topic", "cefrLevel" = excluded."cefrLevel", "learningObjectives" = excluded."learningObjectives", "transcript" = excluded."transcript", "accent" = excluded."accent", "estimatedMinutes" = excluded."estimatedMinutes", "status" = excluded."status", "updatedAt" = CURRENT_TIMESTAMP;`,
    );
    for (const [index, objective] of lesson.learningObjectives.slice(0, 4).entries()) {
      const segmentId = stableId(`listena:tatqhp1:segment:${lesson.id}:${index + 1}`);
      statements.push(
        `INSERT INTO "LessonSegment" ("id", "lessonId", "position", "text", "audioUrl", "startTime", "endTime", "difficulty") VALUES (${sql(segmentId)}, ${sql(lessonId)}, ${sql(index + 1)}, ${sql(objective)}, NULL, NULL, NULL, ${sql(1 + (lesson.unit - 1) * 0.12)}) ON CONFLICT("id") DO UPDATE SET "text" = excluded."text", "position" = excluded."position", "difficulty" = excluded."difficulty";`,
      );
    }

    for (const vocabulary of input.vocabulary.filter((item) => item.unit === lesson.unit)) {
      statements.push(
        `INSERT INTO "LessonVocabulary" ("lessonId", "vocabularyItemId", "isTarget", "importance") SELECT ${sql(lessonId)}, "id", true, 1 FROM "VocabularyItem" WHERE "lemma" = ${sql(vocabulary.lemma.trim().toLowerCase())} ON CONFLICT("lessonId", "vocabularyItemId") DO UPDATE SET "isTarget" = excluded."isTarget", "importance" = excluded."importance";`,
      );
    }

    const exercises = input.exerciseUnits.find((unit) => unit.unit === lesson.unit)?.exercises ?? [];
    for (const exercise of exercises) {
      const datasetId = `tatqhp1-unit-${lesson.unit}-exercise-${exercise.number}`;
      const sourceAnswers = exercise.answers.filter(Boolean);
      const answers = sourceAnswers.map(normalizeSourceText);
      const metadata = {
        datasetId,
        source: DATASET_SOURCE,
        unit: lesson.unit,
        exerciseNumber: exercise.number,
        content: exercise.content,
        answers,
        sourceAnswers,
        answerMode: inferAnswerMode(exercise.title),
      };
      statements.push(
        `INSERT INTO "Exercise" ("id", "lessonId", "segmentId", "type", "prompt", "correctAnswer", "metadata", "difficulty", "position") VALUES (${sql(stableId(`listena:tatqhp1:exercise:${lesson.unit}:${exercise.number}`))}, ${sql(lessonId)}, NULL, ${sql(inferExerciseType(exercise.title, exercise.number))}, ${sql(exercise.title)}, ${sql(answers.join("\n") || "Câu trả lời mở")}, ${sql(json(metadata))}, ${sql(1 + (lesson.unit - 1) * 0.12)}, ${sql(exercise.number)}) ON CONFLICT("id") DO UPDATE SET "type" = excluded."type", "prompt" = excluded."prompt", "correctAnswer" = excluded."correctAnswer", "metadata" = excluded."metadata", "difficulty" = excluded."difficulty", "position" = excluded."position";`,
      );
    }
  }

  return `${statements.join("\n")}\n`;
}

async function main() {
  const outputPath = parseOutputPath();
  const lessons = lessonsData.items as LessonSource[];
  const vocabulary = vocabularyData.items as VocabularySource[];
  const grammar = grammarData.items as GrammarSource[];
  const exerciseUnits = exercisesData.units as ExerciseUnit[];
  validateDataset(lessons, vocabulary, grammar, exerciseUnits);
  const output = buildSql({ lessons, vocabulary, grammar, exerciseUnits });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  console.log(
    JSON.stringify({
      outputPath,
      lessons: lessons.length,
      vocabulary: vocabulary.length,
      exercises: exerciseUnits.reduce((total, unit) => total + unit.exercises.length, 0),
      destructiveStatements: output
        .split("\n")
        .some((line) => /^\s*(?:DELETE|DROP|TRUNCATE|RESET)\b/i.test(line)),
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
