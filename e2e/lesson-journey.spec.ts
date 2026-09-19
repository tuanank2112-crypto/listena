import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../src/lib/prisma";

/**
 * Plan22 SPEC-P224: a lesson shows its five-step path, the steps tick off from
 * evidence the server already holds, and one learner never sees another's.
 */
test.afterAll(async () => db.$disconnect());

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  return db.user.findUniqueOrThrow({ where: { email: "learner@example.com" } });
}

async function publishedLesson() {
  return db.lesson.findFirstOrThrow({
    where: { status: "PUBLISHED", vocabulary: { some: {} }, exercises: { some: {} } },
    include: { exercises: { select: { id: true } }, vocabulary: { select: { vocabularyItemId: true } } },
  });
}

test("the journey route rejects anonymous callers and unknown lessons", async ({ request, page }) => {
  const lesson = await publishedLesson();
  expect((await request.get(`/api/learner/lessons/${lesson.id}/journey`)).status()).toBe(401);
  expect((await request.post(`/api/learner/lessons/${lesson.id}/journey`)).status()).toBe(401);

  await login(page);
  const unknown = await page.request.get(`/api/learner/lessons/${randomUUID()}/journey`);
  expect(unknown.status()).toBe(404);
});

test("a learner sees the five steps and reading the words ticks the first one", async ({ page }) => {
  const learner = await login(page);
  const lesson = await publishedLesson();
  await db.lessonJourneyProgress.deleteMany({ where: { userId: learner.id, lessonId: lesson.id } });

  try {
    await page.goto(`/learner/lessons/${lesson.id}`);
    const band = page.locator("section[aria-labelledby='journey-heading']");
    await expect(band).toBeVisible();
    await expect(band.locator("li")).toHaveCount(5);

    // Every step is named in Vietnamese; the enum names must not reach the page.
    for (const step of ["LEARN", "PRACTICE", "PLAY", "LISTEN", "TEST"]) {
      await expect(band.getByText(step, { exact: true })).toHaveCount(0);
    }

    // LEARN is where a learner with no history starts.
    await expect(band.locator("li[data-step='LEARN'][data-done='false']")).toBeVisible();
    await band.locator("li[data-step='LEARN']").getByRole("button").click();

    // Walk the word cards to the end; only then does the step count.
    const cards = page.locator("section[aria-labelledby='word-cards-heading']");
    await expect(cards).toBeVisible();
    for (let guard = 0; guard < 200; guard += 1) {
      const done = cards.getByRole("button", { name: "Đã đọc hết" });
      if (await done.count()) { await done.click(); break; }
      await cards.getByRole("button", { name: "Từ tiếp theo" }).click();
    }

    await expect(band.locator("li[data-step='LEARN'][data-done='true']")).toBeVisible();

    const journey = await (await page.request.get(`/api/learner/lessons/${lesson.id}/journey`)).json();
    expect(journey.percent).toBeGreaterThanOrEqual(20);
    expect(journey.steps.find((step: { step: string }) => step.step === "LEARN").done).toBe(true);
  } finally {
    await db.lessonJourneyProgress.deleteMany({ where: { userId: learner.id, lessonId: lesson.id } });
  }
});

test("a completed lesson-scoped game closes its own step and no other learner's", async ({ page }) => {
  const learner = await login(page);
  const lesson = await publishedLesson();
  const suffix = randomUUID().slice(0, 8);

  const other = await db.user.create({
    data: {
      email: `journey-other-${suffix}@example.com`,
      name: "Other learner",
      password: "not-a-login",
      emailVerifiedAt: new Date(),
    },
  });

  // A finished MATCH run belonging to this lesson is what PLAY is derived from.
  const run = await db.adaptiveGameRun.create({
    data: {
      userId: learner.id,
      lessonId: lesson.id,
      mode: "MATCH",
      status: "COMPLETED",
      targetSkill: "vocabulary",
      difficulty: 1,
      selectionSnapshotHash: `e2e-${suffix}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      completedAt: new Date(),
    },
  });
  // The other learner finished the listening step of the same lesson.
  await db.adaptiveGameRun.create({
    data: {
      userId: other.id,
      lessonId: lesson.id,
      mode: "SPELL",
      status: "COMPLETED",
      targetSkill: "spelling",
      difficulty: 1,
      selectionSnapshotHash: `e2e-other-${suffix}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      completedAt: new Date(),
    },
  });

  try {
    const journey = await (await page.request.get(`/api/learner/lessons/${lesson.id}/journey`)).json();
    const byStep = Object.fromEntries(journey.steps.map((step: { step: string; done: boolean }) => [step.step, step.done]));
    expect(byStep.PLAY).toBe(true);
    // The other learner's SPELL run must not close this learner's LISTEN step.
    expect(byStep.LISTEN).toBe(false);
  } finally {
    await db.adaptiveGameRun.deleteMany({ where: { id: run.id } });
    await db.adaptiveGameRun.deleteMany({ where: { userId: other.id } });
    await db.user.deleteMany({ where: { id: other.id } });
  }
});

test("the games page only accepts a lesson that exists and is published", async ({ page }) => {
  await login(page);
  // A hand-typed unknown lesson falls back to ordinary free play rather than
  // erroring or scoping to nothing.
  await page.goto(`/learner/games?lesson=${randomUUID()}&mode=match`);
  await expect(page.getByText(/Đang chơi với từ của bài/)).toHaveCount(0);

  const lesson = await publishedLesson();
  await page.goto(`/learner/games?lesson=${lesson.id}&mode=match`);
  await expect(page.getByText(/Đang chơi với từ của bài/)).toBeVisible({ timeout: 20_000 });
});
