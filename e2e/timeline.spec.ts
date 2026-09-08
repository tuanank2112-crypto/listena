import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

async function createAndLoginLearner(page: Page) {
  const suffix = randomUUID();
  const email = `timeline-${suffix}@example.com`;
  const user = await db.user.create({ data: {
    name: "Timeline test learner",
    email,
    password: await hash("timeline-test-password", 10),
    role: "LEARNER",
    learnerProfile: { create: {} },
  } });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("timeline-test-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  return { user, suffix };
}

test("timeline shows all learner activity kinds and published curriculum without title coupling", async ({ page }, testInfo) => {
  const { user, suffix } = await createAndLoginLearner(page);
  const timestamp = new Date();
  const publishedCourse = await db.course.create({ data: {
    title: `Renamed published course ${suffix}`,
    createdById: user.id,
  } });
  const publishedLesson = await db.lesson.create({ data: {
    courseId: publishedCourse.id,
    title: `Published timeline lesson ${suffix}`,
    topic: "Timeline",
    transcript: "Timeline lesson transcript",
    status: "PUBLISHED",
    createdById: user.id,
  } });
  const draftCourse = await db.course.create({ data: {
    title: `Draft course ${suffix}`,
    status: "DRAFT",
    createdById: user.id,
  } });
  const draftLesson = await db.lesson.create({ data: {
    courseId: draftCourse.id,
    title: `Draft timeline lesson ${suffix}`,
    topic: "Draft",
    transcript: "Draft lesson transcript",
    status: "DRAFT",
    createdById: user.id,
  } });
  const exercise = await db.exercise.create({ data: {
    lessonId: publishedLesson.id,
    type: "GIST",
    prompt: "Timeline prompt",
    correctAnswer: "timeline",
    position: 1,
  } });
  const vocabulary = await db.vocabularyItem.create({ data: {
    lemma: `timeline-${suffix}`,
    displayText: "timeline",
    meaningVi: "dòng thời gian",
  } });
  await db.lessonVocabulary.create({ data: { lessonId: publishedLesson.id, vocabularyItemId: vocabulary.id } });
  const session = await db.learningSession.create({ data: {
    userId: user.id,
    lessonId: publishedLesson.id,
    mode: "DAILY_QUEST",
    status: "COMPLETED",
    goal: "Timeline activity",
    startedAt: new Date(timestamp.getTime() - 6 * 60_000),
    completedAt: new Date(timestamp.getTime() - 60_000),
  } });
  await db.learningEvidence.create({ data: {
    sessionId: session.id,
    skillKey: "LISTENING",
    evidenceType: "TURN",
    score: .8,
    createdAt: new Date(timestamp.getTime() - 2 * 60_000),
  } });
  await db.attempt.create({ data: {
    userId: user.id,
    lessonId: publishedLesson.id,
    exerciseId: exercise.id,
    submittedAnswer: "timeline",
    score: 90,
    createdAt: new Date(timestamp.getTime() - 3 * 60_000),
  } });
  const flashcard = await db.flashcard.create({ data: {
    userId: user.id,
    vocabularyItemId: vocabulary.id,
    front: "timeline",
    back: "dòng thời gian",
  } });
  await db.reviewLog.create({ data: {
    userId: user.id,
    flashcardId: flashcard.id,
    rating: "GOOD",
    reviewedAt: new Date(timestamp.getTime() - 4 * 60_000),
  } });
  const oldSession = await db.learningSession.create({ data: {
    userId: user.id,
    mode: "DAILY_QUEST",
    status: "COMPLETED",
    goal: "Old timeline activity",
    startedAt: new Date(timestamp.getTime() - 9 * 24 * 60 * 60_000),
    completedAt: new Date(timestamp.getTime() - 8 * 24 * 60 * 60_000),
  } });
  const futureSession = await db.learningSession.create({ data: {
    userId: user.id,
    mode: "DAILY_QUEST",
    status: "COMPLETED",
    goal: "Future timeline activity",
    startedAt: new Date(timestamp.getTime() + 60_000),
    completedAt: new Date(timestamp.getTime() + 5 * 60_000),
  } });

  const boundaryResponse = await page.request.get("/api/learner/timeline?window=30d");
  expect(boundaryResponse.ok()).toBe(true);
  const boundaryTimeline = await boundaryResponse.json();
  expect(boundaryTimeline.weeklyStudyTime).toBe(5);
  expect(boundaryTimeline.items.map((item: { id: string }) => item.id)).toContain(oldSession.id);
  expect(boundaryTimeline.items.map((item: { id: string }) => item.id)).not.toContain(futureSession.id);

  await db.learningSession.createMany({ data: Array.from({ length: 51 }, () => ({
    userId: user.id,
    mode: "DAILY_QUEST",
    status: "COMPLETED",
    goal: "Additional weekly timeline activity",
    startedAt: new Date(timestamp.getTime() - 12 * 60_000),
    completedAt: new Date(timestamp.getTime() - 10 * 60_000),
  })) });
  const otherUser = await db.user.create({ data: {
    name: "Other timeline learner",
    email: `other-timeline-${suffix}@example.com`,
    password: "not-used-for-login",
    role: "LEARNER",
  } });
  const otherSession = await db.learningSession.create({ data: {
    userId: otherUser.id,
    mode: "DAILY_QUEST",
    status: "COMPLETED",
    goal: "Other learner activity",
    startedAt: new Date(timestamp.getTime() - 3 * 60_000),
    completedAt: new Date(timestamp.getTime() - 60_000),
  } });

  const thirtyDayResponse = await page.request.get("/api/learner/timeline?window=30d");
  expect(thirtyDayResponse.ok()).toBe(true);
  const thirtyDayTimeline = await thirtyDayResponse.json();
  expect(thirtyDayTimeline.weeklyStudyTime).toBe(107);
  expect(thirtyDayTimeline.items).toHaveLength(50);
  expect(thirtyDayTimeline.items.map((item: { id: string }) => item.id)).not.toContain(otherSession.id);

  await page.goto("/learner/dashboard");
  await expect(page.getByRole("heading", { name: "Nhịp học gần đây" })).toBeVisible();
  await expect(page.getByText("Hoàn thành phiên AI").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("timeline-dashboard.png"), fullPage: true });

  await page.goto("/learner/progress");
  await expect(page.getByRole("heading", { name: "Hoạt động học" })).toBeVisible();
  await expect(page.getByText("Hoàn thành phiên AI").first()).toBeVisible();
  await expect(page.getByText("AI đánh giá lượt học").first()).toBeVisible();
  await expect(page.getByText("Làm bài luyện tập").first()).toBeVisible();
  await expect(page.getByText("Ôn lại thẻ từ").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("timeline-progress.png"), fullPage: true });

  await page.goto("/learner/lessons");
  await expect(page.getByText(publishedLesson.title, { exact: true })).toBeVisible();
  await expect(page.getByText(draftLesson.title, { exact: true })).toHaveCount(0);
});
