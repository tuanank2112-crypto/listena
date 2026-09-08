import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  return db.user.findUniqueOrThrow({ where: { email: "learner@example.com" } });
}

test("AI comeback resets, persists server grading, and completion is counted once", async ({ page }) => {
  const user = await login(page);
  const create = await page.request.post("/api/learning-sessions", { data: { mode: "MISSION", scenarioKey: "lost-luggage" } });
  expect(create.status()).toBe(201);
  const { session } = await create.json();
  await page.goto("/learner/dashboard");
  await expect(page.getByRole("link", { name: "Tiếp tục phiên AI" })).toHaveAttribute("href", `/learner/session/${session.id}`);
  const challenge = await db.intervention.create({ data: {
    sessionId: session.id, type: "FILL_BLANK", prompt: "Complete: This is my ___.",
    specJson: JSON.stringify({ placeholder: "One luggage word" }),
    validatorJson: JSON.stringify({ acceptedAnswers: ["suitcase"] }),
  } });
  await db.learningSession.update({ where: { id: session.id }, data: {
    stateJson: JSON.stringify({ ...session.state, phase: "COMEBACK" }),
  } });
  await page.getByRole("link", { name: "Tiếp tục phiên AI" }).click();
  const input = page.getByPlaceholder("One luggage word");
  await input.fill("ticket");
  await page.getByRole("button", { name: "Gửi comeback" }).click();
  await expect(page.getByRole("button", { name: "Gửi comeback" })).toBeDisabled();
  await expect(input).toHaveValue("");
  expect((await db.intervention.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("COMPLETED");
  await input.fill("suitcase");
  await page.getByRole("button", { name: "Gửi comeback" }).click();
  await expect(page.getByText("Bạn đã trả lời đúng bài tập. Hãy tiếp tục nhé!")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Bạn đã trả lời đúng bài tập. Hãy tiếp tục nhé!")).toBeVisible();
  const evidence = await db.learningEvidence.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });
  expect(evidence.map((item) => item.score)).toEqual([0, 1]);
  const saved = await db.learningSession.findUniqueOrThrow({ where: { id: session.id } });
  await db.learningSession.update({ where: { id: session.id }, data: {
    stateJson: JSON.stringify({ ...JSON.parse(saved.stateJson), phase: "BOSS" }),
    startedAt: new Date(Date.now() - 10 * 60_000),
  } });
  const before = await db.learnerProfile.findUniqueOrThrow({ where: { userId: user.id } });
  const data = { clientTurnId: randomUUID(), content: "I lost my black suitcase" };
  const finish = await page.request.post(`/api/learning-sessions/${session.id}/turns`, { data });
  expect(finish.ok()).toBe(true);
  expect((await finish.json()).session.status).toBe("COMPLETED");
  const retry = await page.request.post(`/api/learning-sessions/${session.id}/turns`, { data });
  expect((await retry.json()).idempotent).toBe(true);
  expect((await page.request.post(`/api/learning-sessions/${session.id}/complete`)).ok()).toBe(true);
  const after = await db.learnerProfile.findUniqueOrThrow({ where: { userId: user.id } });
  expect(after.totalStudyMinutes - before.totalStudyMinutes).toBe(10);
});

test("flashcards exclude future reviews, retain failed submissions and finish the due queue", async ({ page }) => {
  const user = await login(page);
  const suffix = randomUUID();
  const dueWord = await db.vocabularyItem.create({ data: { lemma: `due-${suffix}`, displayText: "suitcase", meaningVi: "va li" } });
  const futureWord = await db.vocabularyItem.create({ data: { lemma: `future-${suffix}`, displayText: "Future card", meaningVi: "chưa đến hạn" } });
  const due = await db.flashcard.create({ data: { userId: user.id, vocabularyItemId: dueWord.id, front: `Due-${suffix}`, back: "va li" } });
  await db.flashcard.create({ data: { userId: user.id, vocabularyItemId: futureWord.id, front: "Future card", back: "chưa đến hạn" } });
  await db.vocabularyMastery.createMany({ data: [
    { userId: user.id, vocabularyItemId: dueWord.id, correctCount: 7, incorrectCount: 3, nextReviewAt: new Date(Date.now() - 86400_000) },
    { userId: user.id, vocabularyItemId: futureWord.id, nextReviewAt: new Date(Date.now() + 86400_000) },
  ] });
  await page.goto("/learner/flashcards");
  await expect(page.getByText(`Due-${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Future card", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Lật thẻ", exact: true }).click();
  await page.route("**/api/flashcard", (route) => route.fulfill({ status: 503, json: { error: "offline" } }), { times: 1 });
  await page.getByRole("button", { name: "Tốt", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Chưa lưu được" })).toBeVisible();
  await expect(page.getByText(`Due-${suffix}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tốt", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Xong hôm nay!" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Xong hôm nay!" })).toBeVisible();
  const mastery = await db.vocabularyMastery.findUniqueOrThrow({ where: { userId_vocabularyItemId: { userId: user.id, vocabularyItemId: dueWord.id } } });
  expect([mastery.correctCount, mastery.incorrectCount]).toEqual([8, 3]);
  expect(await db.reviewLog.count({ where: { flashcardId: due.id } })).toBe(1);
});
