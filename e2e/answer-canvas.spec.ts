import { expect, test, type Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { prisma as db } from "../src/lib/prisma";

/**
 * SPEC-P133 Answer Canvas: TILES → arrange → submit → result badge;
 * SKELETON → submit. hintCount on Attempt = assist hintCost + old "Gợi ý" clicks.
 */
const LEARNER_ID = "canvas-learner-1";
const TEACHER_ID = "canvas-teacher-1";
const ANSWER_WORDS = ["they", "went", "to", "da", "nang"];
let lessonId = "";
let exerciseId = "";

test.beforeAll(async () => {
  const passwordHash = await hash("demo1234", 10);
  await db.user.upsert({
    where: { email: "canvas-learner@example.com" },
    create: {
      id: LEARNER_ID,
      email: "canvas-learner@example.com",
      name: "Canvas Learner",
      password: passwordHash,
      role: "LEARNER",
      emailVerifiedAt: new Date(),
      learnerProfile: { create: { estimatedCefrLevel: "A2", listeningMastery: 0.5, vocabularyMastery: 0.5 } },
    },
    update: {},
  });
  await db.user.upsert({
    where: { email: "canvas-teacher@example.com" },
    create: {
      id: TEACHER_ID,
      email: "canvas-teacher@example.com",
      name: "Canvas Teacher",
      password: passwordHash,
      role: "TEACHER",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });
  const course = await db.course.create({
    data: { title: "Canvas Course", cefrLevel: "A2", status: "PUBLISHED", createdById: TEACHER_ID },
  });
  const lesson = await db.lesson.create({
    data: {
      courseId: course.id,
      title: "Canvas Lesson",
      topic: "Travel",
      cefrLevel: "A2",
      transcript:
        "Last summer my family went to Da Nang for a holiday. We swam in the sea and built sandcastles on the beach. The hotel had a lovely view.",
      status: "PUBLISHED",
      createdById: TEACHER_ID,
      exercises: {
        create: [
          {
            type: "GIST",
            prompt: "Where did the family go?",
            correctAnswer: "They went to Da Nang.",
            metadata: JSON.stringify({ answerMode: "guided" }),
            position: 1,
          },
        ],
      },
    },
    include: { exercises: true },
  });
  lessonId = lesson.id;
  exerciseId = lesson.exercises[0].id;
});

test.afterAll(async () => {
  await db.attempt.deleteMany({ where: { userId: LEARNER_ID } });
  await db.flashcard.deleteMany({ where: { userId: LEARNER_ID } });
  await db.exercise.deleteMany({ where: { lessonId } });
  await db.lesson.deleteMany({ where: { createdById: TEACHER_ID } });
  await db.course.deleteMany({ where: { createdById: TEACHER_ID } });
  await db.learnerProfile.deleteMany({ where: { userId: LEARNER_ID } });
  await db.user.deleteMany({ where: { id: { in: [LEARNER_ID, TEACHER_ID] } } });
  await db.$disconnect();
});

test.beforeEach(async () => {
  await db.attempt.deleteMany({ where: { userId: LEARNER_ID } });
});

async function loginLearner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("canvas-learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
}

test("TILES: fetch tiles, arrange them, bet 3 stars, submit and see badges; hintCount = 2 + 1 old hint", async ({ page }) => {
  await loginLearner(page);
  await page.goto(`/learner/lessons/${lessonId}`);
  await expect(page.locator("#answer")).toBeVisible();

  // Old text hint still costs 1.
  await page.getByRole("button", { name: "Gợi ý", exact: true }).click();

  const assist = page.waitForResponse((response) => response.url().includes("/api/attempt/assist"));
  await page.getByRole("button", { name: /Lấy mảnh/ }).click();
  const assistPayload = await (await assist).json() as { tiles: string[]; hintCost: number };
  expect(assistPayload.hintCost).toBe(2);
  expect(assistPayload.tiles).toHaveLength(ANSWER_WORDS.length + 2);
  expect(assistPayload.tiles.filter((tile) => ANSWER_WORDS.includes(tile))).not.toEqual(ANSWER_WORDS);

  const bank = page.getByRole("group", { name: "Mảnh chữ" });
  for (const word of ANSWER_WORDS) {
    await bank.getByRole("button", { name: word, exact: true }).click();
  }
  const arranged = page.getByRole("group", { name: "Câu đang xếp" });
  await expect(arranged.getByRole("button")).toHaveCount(ANSWER_WORDS.length);

  await page.getByRole("button", { name: /^3 sao/ }).click();
  await page.getByRole("button", { name: "Kiểm tra" }).click();

  await expect(page).toHaveURL(/\/learner\/attempt\/[0-9a-f-]+$/);
  await expect(page.getByTestId("assist-mode-badge")).toHaveText(/Ghép mảnh/);
  await expect(page.getByTestId("confidence-badge")).toHaveText(/3 sao/);

  const attempt = await db.attempt.findFirstOrThrow({ where: { userId: LEARNER_ID, exerciseId } });
  expect(attempt.hintCount).toBe(3);
  expect(attempt.submittedAnswer).toBe(ANSWER_WORDS.join(" "));
  expect(attempt.assistMode).toBe("TILES");
  expect(attempt.confidence).toBe(3);
  expect(attempt.score).toBe(100);
});

test("SKELETON: open the frame, type into the slots and submit; hintCount = 1, no bet", async ({ page }) => {
  await loginLearner(page);
  await page.goto(`/learner/lessons/${lessonId}`);
  await expect(page.locator("#answer")).toBeVisible();

  const assist = page.waitForResponse((response) => response.url().includes("/api/attempt/assist"));
  await page.getByRole("button", { name: /Mở khung/ }).click();
  const payload = await (await assist).json() as { skeleton: Array<{ length: number; first?: string }>; hintCost: number };
  expect(payload.hintCost).toBe(1);
  expect(payload.skeleton.map((slot) => slot.length)).toEqual([4, 4, 2, 2, 4]);
  expect(payload.skeleton.filter((slot) => slot.first).length).toBeLessThanOrEqual(1);

  const frame = page.getByRole("group", { name: "Khung từ" });
  for (const [index, word] of ANSWER_WORDS.entries()) {
    const slot = payload.skeleton[index];
    const typed = slot.first ? word.slice(1) : word;
    await frame.getByLabel(`Từ ${index + 1}, ${word.length} chữ`).fill(typed);
  }

  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await expect(page).toHaveURL(/\/learner\/attempt\/[0-9a-f-]+$/);
  await expect(page.getByTestId("assist-mode-badge")).toHaveText(/Viết dần/);
  await expect(page.getByTestId("confidence-badge")).toHaveCount(0);

  const attempt = await db.attempt.findFirstOrThrow({ where: { userId: LEARNER_ID, exerciseId } });
  expect(attempt.hintCount).toBe(1);
  expect(attempt.assistMode).toBe("SKELETON");
  expect(attempt.confidence).toBeNull();
  expect(attempt.submittedAnswer).toBe(ANSWER_WORDS.join(" "));
});

test("FREE: chips compose the answer and the assist endpoint refuses open answers", async ({ page }) => {
  await loginLearner(page);
  await page.goto(`/learner/lessons/${lessonId}`);
  const input = page.locator("#answer");
  await input.fill("They went to ");
  await expect(page.getByRole("list", { name: "Các từ đã gõ" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Xoá từ to" }).click();
  await input.fill("to Da Nang");
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await expect(page).toHaveURL(/\/learner\/attempt\/[0-9a-f-]+$/);
  const attempt = await db.attempt.findFirstOrThrow({ where: { userId: LEARNER_ID, exerciseId } });
  expect(attempt.submittedAnswer).toBe("They went to Da Nang");
  expect(attempt.hintCount).toBe(0);
  expect(attempt.assistMode).toBe("FREE");

  const forbidden = await page.request.post("/api/attempt/assist", {
    data: { exerciseId, lessonId, clientAttemptId: "00000000-0000-4000-8000-00000000abcd", mode: "TILES" },
  });
  expect(forbidden.status()).toBe(200);
  await db.exercise.update({ where: { id: exerciseId }, data: { metadata: JSON.stringify({ answerMode: "open" }) } });
  const open = await page.request.post("/api/attempt/assist", {
    data: { exerciseId, lessonId, clientAttemptId: "00000000-0000-4000-8000-00000000abcd", mode: "TILES" },
  });
  expect(open.status()).toBe(404);
  await db.exercise.update({ where: { id: exerciseId }, data: { metadata: JSON.stringify({ answerMode: "guided" }) } });
});
