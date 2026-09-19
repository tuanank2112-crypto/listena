import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../src/lib/prisma";

import { hash } from "bcryptjs";

test.beforeAll(async () => {
  const passwordHash = await hash("demo1234", 10);
  await db.user.upsert({
    where: { email: "integrity-learner@example.com" },
    create: {
      id: "integrity-learner-1",
      email: "integrity-learner@example.com",
      name: "Integrity Learner",
      password: passwordHash,
      role: "LEARNER",
      emailVerifiedAt: new Date(),
      learnerProfile: {
        create: {
          estimatedCefrLevel: "A2",
          listeningMastery: 0.5,
          vocabularyMastery: 0.5,
        },
      },
    },
    update: {},
  });

  await db.user.upsert({
    where: { email: "integrity-teacher@example.com" },
    create: {
      id: "integrity-teacher-1",
      email: "integrity-teacher@example.com",
      name: "Integrity Teacher",
      password: passwordHash,
      role: "TEACHER",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });
});

test.afterAll(async () => {
  await db.attempt.deleteMany({ where: { userId: "integrity-learner-1" } });
  await db.flashcard.deleteMany({ where: { userId: "integrity-learner-1" } });
  await db.lessonCreationRequest.deleteMany({ where: { userId: "integrity-teacher-1" } });
  await db.lesson.deleteMany({ where: { createdById: "integrity-teacher-1" } });
  await db.course.deleteMany({ where: { createdById: "integrity-teacher-1" } });
  await db.learnerProfile.deleteMany({ where: { userId: "integrity-learner-1" } });
  await db.user.deleteMany({ where: { id: { in: ["integrity-learner-1", "integrity-teacher-1"] } } });
  await db.$disconnect();
});

async function loginLearner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("integrity-learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  return db.user.findUniqueOrThrow({ where: { email: "integrity-learner@example.com" } });
}

async function loginTeacher(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("integrity-teacher@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/teacher/);
  return db.user.findUniqueOrThrow({ where: { email: "integrity-teacher@example.com" } });
}

test.describe("Plan 11/12 — Learning and Authoring E2E Integrity (T111-06, T112-01)", () => {
  test("T111-06: Attempt network abort, reload, answer lock, and replay deduplication", async ({ page }) => {
    const learner = await loginLearner(page);

    const lesson = await db.lesson.findFirstOrThrow({
      where: { status: "PUBLISHED" },
      include: { exercises: true },
    });
    const exercise = lesson.exercises[0];
    expect(exercise).toBeDefined();

    // Clean any prior attempts for this test exercise
    await db.attempt.deleteMany({
      where: { userId: learner.id, exerciseId: exercise.id },
    });

    await page.goto(`/learner/lessons/${lesson.id}`);

    const answerInput = page.locator("#answer");
    await expect(answerInput).toBeVisible();

    const originalAnswer = "Welcome to the airport";
    await answerInput.fill(originalAnswer);

    // Abort the first attempt network request to simulate drop
    let abortedOnce = false;
    await page.route("**/api/attempt", async (route) => {
      if (!abortedOnce) {
        abortedOnce = true;
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    const submitBtn = page.getByRole("button", { name: "Kiểm tra" });
    await submitBtn.click();

    // Wait for network abort to register in the client
    await page.waitForTimeout(500);

    // Try to change answer while intent is pending outcome
    await answerInput.fill("Something completely different");
    await submitBtn.click();

    // UI blocks changing answer with pending intent
    const errorNotice = page.getByText(/Lần gửi trước chưa có kết quả xác định/i);
    await expect(errorNotice).toBeVisible();

    // Revert answer to original payload and reload
    await answerInput.fill(originalAnswer);
    await page.reload();

    // Replay with original answer
    const reloadedInput = page.locator("#answer");
    await expect(reloadedInput).toBeVisible();
    await reloadedInput.fill(originalAnswer);

    const reloadedSubmitBtn = page.getByRole("button", { name: "Kiểm tra" });
    // Wait for the replayed submission itself. Watching the button instead was a
    // race: it could report "enabled" before the click had disabled it, and once
    // grading lands the page swaps the button for the result screen, so the
    // locator resolves to nothing. On a built server the swap always won.
    const replayed = page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/api/attempt" && res.request().method() === "POST",
    );
    await reloadedSubmitBtn.click();
    await replayed;

    // Database verification: Exactly 1 attempt created in DB
    const attempts = await db.attempt.findMany({
      where: { userId: learner.id, exerciseId: exercise.id },
    });
    expect(attempts.length).toBe(1);
  });

  test("T112-01: Teacher manual & AI lesson authoring on /teacher/lessons/new", async ({ page }) => {
    const teacher = await loginTeacher(page);

    // Ensure teacher has a course
    let course = await db.course.findFirst({ where: { createdById: teacher.id } });
    if (!course) {
      course = await db.course.create({
        data: {
          title: "Teacher Course A2",
          cefrLevel: "A2",
          status: "PUBLISHED",
          createdById: teacher.id,
        },
      });
    }

    await page.goto("/teacher/lessons/new");

    // Case 1: Manual Lesson Creation
    const manualTitle = `E2E Manual Lesson ${randomUUID().slice(0, 8)}`;
    await page.locator("#course-id").fill(course.id);
    await page.locator("#title").fill(manualTitle);
    await page.locator("#topic").fill("Travel");
    await page.locator("#transcript").fill("Welcome to flight 101. Please fasten your seatbelt and enjoy the flight.");

    const createManualBtn = page.getByRole("button", { name: "Tạo bài học" });
    const [manualResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/teacher/lesson")),
      createManualBtn.click(),
    ]);
    expect(manualResponse.status()).toBe(201);

    const createdLesson = await db.lesson.findFirst({
      where: { title: manualTitle, createdById: teacher.id },
    });
    expect(createdLesson).not.toBeNull();
    expect(createdLesson?.status).toBe("DRAFT");

    // Case 2: AI Lesson Creation using test stub
    await page.goto("/teacher/lessons/new");

    // Click AI Mode tab
    await page.getByRole("button", { name: "AI hỗ trợ" }).click();

    const aiTopic = `AI Lesson ${randomUUID().slice(0, 8)}`;
    await page.locator("#ai-topic").fill(aiTopic);
    await page.locator("#ai-objectives").fill("Coffee ordering vocabulary\nAsking for the bill");

    const generateAIBtn = page.getByRole("button", { name: "Tạo bài học với AI" });
    const [aiResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/teacher/generate-lesson")),
      generateAIBtn.click(),
    ]);
    expect(aiResponse.status()).toBe(201);

    const aiCreatedLesson = await db.lesson.findFirst({
      where: { createdById: teacher.id, topic: aiTopic },
    });
    expect(aiCreatedLesson).not.toBeNull();
  });
});
