/**
 * Import the verified TATQHP1 dataset into ListenAI.
 * Run with: npm run dataset:import
 *
 * Scope note: despite an older header, this script has never imported the
 * Educaplay "Da Nang family getaway" material. `dataset/danang-getaway-lesson.json`
 * and `dataset/educaplay-danang.json` are reference samples only (see
 * `dataset/manifest.json`); the Da Nang lesson learners actually see is built by
 * `prisma/seed.ts`. Wiring the JSON in here would add a lesson to the live
 * curriculum, which is a product decision, not an import fix.
 */
import type { CefrLevel, ExerciseType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { resolveDatabaseConfig } from "../src/lib/database-config";
import vocabularyData from "../dataset/vocabulary.json";
import lessonsData from "../dataset/lessons.json";
import grammarData from "../dataset/grammar-reference.json";
import exercisesData from "../dataset/exercises.json";
import { cleanVocabularyMeaning } from "../src/core/text/vocabulary";

/**
 * Plan13 SPEC-P134 §4 (finding D8) — hosted import guard.
 *
 * This script force-publishes lessons and rewrites exercise content on every
 * run. The repository runtime resolver is the only reader of APP_RUNTIME /
 * TURSO_* / DATABASE_URL and fails closed (throws) for APP_RUNTIME=vercel
 * without Turso, so the only hosted runtime that can reach a write here is
 * "turso". Writing to it needs BOTH `--allow-hosted` and
 * `IMPORT_CONFIRM=<turso database name>`; otherwise exit 2 before any query.
 */
function assertHostedImportConfirmed() {
  let config: ReturnType<typeof resolveDatabaseConfig>;
  try {
    config = resolveDatabaseConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Database configuration is missing or invalid.");
    process.exit(1);
  }
  if (config.runtime !== "turso") return;

  const allowHosted = process.argv.slice(2).includes("--allow-hosted");
  const confirmation = process.env.IMPORT_CONFIRM?.trim() ?? "";
  // Turso hostnames are `<database>-<org>[.<region>].turso.io`; the operator
  // must repeat the database name. Never echo the URL or the token.
  const hostLabel = new URL(config.url).hostname.split(".")[0] ?? "";
  const confirmed =
    confirmation.length > 0 && (hostLabel === confirmation || hostLabel.startsWith(`${confirmation}-`));
  if (allowHosted && confirmed) {
    console.warn(`Hosted import confirmed for Turso database "${confirmation}" (--allow-hosted).`);
    return;
  }
  console.error(
    "Refusing to import into a hosted (Turso) database. Re-run with --allow-hosted and IMPORT_CONFIRM=<turso database name> matching the configured database. Nothing was written."
  );
  process.exit(2);
}

assertHostedImportConfirmed();

const COURSE_TITLE = "TATQHP1 - SOLUTIONS Pre-Intermediate";
const DATASET_SOURCE = "Sách HDH TATQHP1 SOLUTIONS đã chỉnh sửa theo ý kiến hội đồng lần 2.docx";

const SOURCE_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bicy hockey\b/gi, "ice hockey"],
  [/\billgal\b/gi, "illegal"],
  [/\bscience fiction fim\b/gi, "science fiction film"],
  [/\bcolcanic eruption\b/gi, "volcanic eruption"],
  [/\bpresent continous\b/gi, "present continuous"],
];

function normalizeSourceText(value: string) {
  return SOURCE_CORRECTIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value.trim()
  );
}

function inferExerciseType(title: string, exerciseNumber: number): ExerciseType {
  const normalized = title.toLowerCase();
  return exerciseNumber <= 4 || /vocabulary|word|adjective|film|programme|weather/.test(normalized)
    ? "VOCABULARY"
    : "GIST";
}
function inferAnswerMode(title: string) {
  return /^(writing|speaking) practice|with your own words|short paragraph/i.test(title)
    ? "open"
    : "guided";
}

async function requireTeacher() {
  const teacher = await prisma.user.findFirst({ where: { role: "TEACHER" } });
  if (!teacher) throw new Error("Không tìm thấy tài khoản TEACHER. Hãy chạy `npm run db:seed` trước.");
  return teacher;
}

async function upsertVocabulary() {
  let created = 0;
  for (const vocabulary of vocabularyData.items) {
    const exists = await prisma.vocabularyItem.findUnique({ where: { lemma: vocabulary.lemma } });
    const data = {
      displayText: vocabulary.displayText,
      ipa: vocabulary.ipa || null,
      meaningVi: cleanVocabularyMeaning(vocabulary.meaningVi || vocabulary.displayText, vocabulary.exampleSentence),
      meaningEn: vocabulary.meaningEn || null,
      partOfSpeech: vocabulary.partOfSpeech || null,
      cefrLevel: vocabulary.cefrLevel as CefrLevel,
      exampleSentence: vocabulary.exampleSentence || null,
    };
    await prisma.vocabularyItem.upsert({
      where: { lemma: vocabulary.lemma },
      update: data,
      create: { lemma: vocabulary.lemma, ...data },
    });
    if (!exists) created++;
  }
  console.log(`Vocabulary: ${created} created, ${vocabularyData.items.length - created} refreshed.`);
}

async function upsertCourse(teacherId: string) {
  const existing = await prisma.course.findFirst({ where: { title: COURSE_TITLE } });
  const data = {
    description: "Giáo trình tự học tiếng Anh A2, tích hợp bài tập, từ vựng, ngữ pháp và gia sư AI.",
    cefrLevel: "A2" as CefrLevel,
    status: "PUBLISHED" as const,
  };
  if (existing) return prisma.course.update({ where: { id: existing.id }, data });
  return prisma.course.create({ data: { title: COURSE_TITLE, createdById: teacherId, ...data } });
}

async function importUnitLessons(courseId: string, teacherId: string) {
  for (const unit of lessonsData.items) {
    const grammarTopics = grammarData.items.filter((grammar) => grammar.unit === unit.unit);
    const exerciseGroup = exercisesData.units.find((group) => group.unit === unit.unit);
    const unitVocabulary = vocabularyData.items.filter((vocabulary) => vocabulary.unit === unit.unit);
    const transcript = [
      unit.title,
      ...unit.learningObjectives.slice(0, 4),
      ...grammarTopics.map((grammar) => `${grammar.title}. ${grammar.content.slice(0, 800)}`),
    ].join("\n\n");

    let lesson = await prisma.lesson.findFirst({ where: { courseId, title: unit.title } });
    const lessonData = {
      topic: unit.topic,
      cefrLevel: unit.cefrLevel as CefrLevel,
      learningObjectives: unit.learningObjectives.join("\n"),
      transcript,
      accent: "uk",
      estimatedMinutes: Math.max(15, unit.exerciseCount * 2),
      status: "PUBLISHED" as const,
    };
    lesson = lesson
      ? await prisma.lesson.update({ where: { id: lesson.id }, data: lessonData })
      : await prisma.lesson.create({
          data: { courseId, title: unit.title, createdById: teacherId, ...lessonData },
        });

    const existingExercises = await prisma.exercise.findMany({ where: { lessonId: lesson.id } });
    const existingByDatasetId = new Map(
      existingExercises.flatMap((exercise) => {
        try {
          const metadata = JSON.parse(exercise.metadata || "{}") as { datasetId?: unknown };
          return typeof metadata.datasetId === "string" ? [[metadata.datasetId, exercise] as const] : [];
        } catch {
          return [];
        }
      })
    );

    for (const exercise of exerciseGroup?.exercises ?? []) {
      const datasetId = `tatqhp1-unit-${unit.unit}-exercise-${exercise.number}`;
      const sourceAnswers = exercise.answers.filter(Boolean);
      const answers = sourceAnswers.map(normalizeSourceText);
      const exerciseData = {
        type: inferExerciseType(exercise.title, exercise.number),
        prompt: exercise.title,
        correctAnswer: answers.join("\n") || "Câu trả lời mở",
        metadata: JSON.stringify({
          datasetId,
          source: DATASET_SOURCE,
          unit: unit.unit,
          exerciseNumber: exercise.number,
          content: exercise.content,
          answers,
          sourceAnswers,
          answerMode: inferAnswerMode(exercise.title),
        }),
        difficulty: 1 + (unit.unit - 1) * 0.12,
        position: exercise.number,
      };
      const existingExercise = existingByDatasetId.get(datasetId);
      if (existingExercise) {
        await prisma.exercise.update({ where: { id: existingExercise.id }, data: exerciseData });
      } else {
        await prisma.exercise.create({ data: { lessonId: lesson.id, ...exerciseData } });
      }
    }

    for (const vocabulary of unitVocabulary) {
      const item = await prisma.vocabularyItem.findUnique({ where: { lemma: vocabulary.lemma } });
      if (!item) continue;
      await prisma.lessonVocabulary.upsert({
        where: { lessonId_vocabularyItemId: { lessonId: lesson.id, vocabularyItemId: item.id } },
        update: { isTarget: true, importance: 1 },
        create: { lessonId: lesson.id, vocabularyItemId: item.id, isTarget: true, importance: 1 },
      });
    }
    console.log(`Unit ${unit.unit}: ${exerciseGroup?.exercises.length ?? 0} exercises, ${unitVocabulary.length} words.`);
  }
}

async function main() {
  console.log("Importing verified TATQHP1 dataset...");
  const teacher = await requireTeacher();
  await upsertVocabulary();
  const course = await upsertCourse(teacher.id);
  await importUnitLessons(course.id, teacher.id);
  await prisma.lesson.updateMany({
    where: { courseId: course.id, title: "Da Nang Family Getaway" },
    data: { status: "DRAFT" },
  });
  console.log({
    courses: await prisma.course.count(),
    lessons: await prisma.lesson.count(),
    exercises: await prisma.exercise.count(),
    vocabulary: await prisma.vocabularyItem.count(),
  });
}

main()
  .catch((error) => {
    console.error("Dataset import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
