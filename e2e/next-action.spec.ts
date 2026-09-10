import { expect, test, type Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../src/lib/prisma";

test.afterAll(async () => db.$disconnect());

async function createAndLoginLearner(page: Page) {
  const email = `next-action-${randomUUID()}@example.com`;
  const password = "next-action-pass";
  const user = await db.user.create({
    data: { name: "Next action learner", email, password: await hash(password, 8), role: "LEARNER" },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  return user;
}

async function createMission(page: Page) {
  const response = await page.request.post("/api/learning-sessions", {
    data: { mode: "MISSION", scenarioKey: "lost-luggage" },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json() as { session: { id: string } };
  return payload.session.id;
}

async function waitForNewSession(page: Page, previousSessionId: string) {
  const previousPath = `/learner/session/${previousSessionId}`;
  await page.waitForURL((url) => (
    url.pathname.startsWith("/learner/session/") && url.pathname !== previousPath
  ));
  const nextSessionId = new URL(page.url()).pathname.split("/").at(-1);
  expect(nextSessionId).toBeTruthy();
  expect(nextSessionId).not.toBe(previousSessionId);
  return nextSessionId!;
}

async function expectSessionCtaStartsOwnedSession(page: Page, userId: string, previousSessionId: string, cta: string, mode: "MISSION" | "DAILY_QUEST" | "LESSON_COACH") {
  await page.getByRole("button", { name: cta }).click();
  const nextSessionId = await waitForNewSession(page, previousSessionId);
  await expect.poll(async () => db.learningSession.findFirst({
    where: { id: nextSessionId, userId, mode },
    select: { id: true },
  })).toEqual({ id: nextSessionId });
}

test("an untouched Mission cannot be completed or claim study time", async ({ page }) => {
  const user = await createAndLoginLearner(page);
  await db.learnerProfile.create({ data: { userId: user.id } });
  const sessionId = await createMission(page);
  const before = await db.learnerProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: { totalStudyMinutes: true },
  });

  const complete = await page.request.post(`/api/learning-sessions/${sessionId}/complete`);

  expect(complete.status()).toBe(409);
  await expect(complete.json()).resolves.toMatchObject({ code: "SESSION_CONFLICT" });
  await expect.poll(async () => db.learningSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { status: true, completedAt: true },
  })).toEqual({ status: "ACTIVE", completedAt: null });
  await expect.poll(async () => db.learnerProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: { totalStudyMinutes: true },
  })).toEqual(before);
});

test("manual completion retains a grounded next action after reload and starts an owned Mission", async ({ page }, testInfo) => {
  const user = await createAndLoginLearner(page);
  const sessionId = await createMission(page);
  await db.learningEvidence.create({
    data: { sessionId, skillKey: "listening", evidenceType: "E2E", score: 0.65, confidence: 1 },
  });

  const complete = await page.request.post(`/api/learning-sessions/${sessionId}/complete`);
  expect(complete.ok()).toBe(true);
  expect((await complete.json()).nextAction).toMatchObject({ kind: "MISSION" });

  await page.goto(`/learner/session/${sessionId}`);
  await expect(page.getByRole("heading", { name: "Bạn đã dừng phiên luyện tập." })).toBeVisible();
  await expect(page.getByLabel("Phiên luyện tập chưa hoàn thành")).toBeVisible();
  await expect(page.getByLabel("Mission hoàn thành")).toHaveCount(0);
  await expect(page.getByText("Bước tiếp theo")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Bước tiếp theo")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("manual-debrief.png"), fullPage: true });
  await expectSessionCtaStartsOwnedSession(page, user.id, sessionId, "Vào Mission tiếp theo", "MISSION");
});

test("automatic completion returns a next action that survives reload and starts an owned Mission", async ({ page }, testInfo) => {
  const user = await createAndLoginLearner(page);
  const sessionId = await createMission(page);
  const session = await db.learningSession.findUniqueOrThrow({ where: { id: sessionId } });
  await db.learningSession.update({
    where: { id: sessionId },
    data: { stateJson: JSON.stringify({ ...JSON.parse(session.stateJson), phase: "BOSS" }) },
  });

  const response = await page.request.post(`/api/learning-sessions/${sessionId}/turns`, {
    data: { clientTurnId: randomUUID(), content: "I lost my black suitcase." },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { session: { status: string }; nextAction: { kind: "COACH" | "MISSION" | "QUEST" | "PRACTICE"; goal: string } | null };
  expect(payload.session.status).toBe("COMPLETED");
  expect(payload.nextAction?.kind).toBeTruthy();
  expect(payload.nextAction?.goal).toBeTruthy();

  await page.goto(`/learner/session/${sessionId}`);
  await expect(page.getByText("Bước tiếp theo")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Bước tiếp theo")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("automatic-debrief.png"), fullPage: true });
  await expectSessionCtaStartsOwnedSession(page, user.id, sessionId, "Luyện lại phần này", "MISSION");
});

test("a due-word Quest carries its recommended word into the new session", async ({ page }) => {
  const user = await createAndLoginLearner(page);
  const sessionId = await createMission(page);
  const vocabulary = await db.vocabularyItem.findFirstOrThrow({
    where: { lessons: { some: { lesson: { status: "PUBLISHED" } } } },
    orderBy: { lemma: "asc" },
    select: { id: true, displayText: true },
  });
  await db.vocabularyMastery.create({
    data: {
      userId: user.id,
      vocabularyItemId: vocabulary.id,
      masteryScore: 0.8,
      nextReviewAt: new Date(Date.now() - 60_000),
    },
  });
  await db.learningEvidence.create({
    data: { sessionId, skillKey: "communication", evidenceType: "E2E", score: 0.8, confidence: 1 },
  });

  const complete = await page.request.post(`/api/learning-sessions/${sessionId}/complete`);
  const completed = await complete.json() as { nextAction: { kind: string; targetId: string } | null };
  expect(completed.nextAction).toMatchObject({ kind: "QUEST" });

  await page.goto(`/learner/session/${sessionId}`);
  await page.getByRole("button", { name: "Bắt đầu Daily Quest" }).click();
  const questId = await waitForNewSession(page, sessionId);
  const quest = await db.learningSession.findUniqueOrThrow({ where: { id: questId } });
  const state = JSON.parse(quest.stateJson) as { targetVocabulary: string[] };
  expect(quest.userId).toBe(user.id);
  expect(quest.mode).toBe("DAILY_QUEST");
  expect(state.targetVocabulary).toContain(vocabulary.displayText);
});

test("a Coach CTA starts the recommended published lesson for its owner", async ({ page }) => {
  const user = await createAndLoginLearner(page);
  const sessionId = await createMission(page);
  await db.skillMastery.create({
    data: { userId: user.id, skillKey: "listening", masteryScore: 0.4, evidenceCount: 1 },
  });
  await db.learningEvidence.create({
    data: { sessionId, skillKey: "listening", evidenceType: "E2E", score: 0.4, confidence: 1 },
  });

  const complete = await page.request.post(`/api/learning-sessions/${sessionId}/complete`);
  const completed = await complete.json() as { nextAction: { kind: string; targetId: string } | null };
  expect(completed.nextAction).toMatchObject({ kind: "COACH" });

  await page.goto(`/learner/session/${sessionId}`);
  await page.getByRole("button", { name: "Học cùng Coach" }).click();
  const coachId = await waitForNewSession(page, sessionId);
  await expect.poll(async () => db.learningSession.findFirst({
    where: { id: coachId, userId: user.id, mode: "LESSON_COACH", lessonId: completed.nextAction?.targetId },
    select: { id: true },
  })).toEqual({ id: coachId });
});

test("a recurring owned error starts a corrective Practice Mission with its custom goal", async ({ page }) => {
  const user = await createAndLoginLearner(page);
  const earlierSessionId = await createMission(page);
  const earlierEvidence = await db.learningEvidence.create({
    data: { sessionId: earlierSessionId, skillKey: "grammar", evidenceType: "E2E", score: 0.3, confidence: 1 },
  });
  await db.learnerMemory.create({
    data: {
      userId: user.id,
      goalsJson: "[]",
      skillsJson: "[]",
      preferencesJson: "{}",
      errorsJson: JSON.stringify([{ errorType: "missing_verb", count: 3, lastEvidenceId: earlierEvidence.id }]),
    },
  });
  const sessionId = await createMission(page);
  await db.learningEvidence.create({
    data: { sessionId, skillKey: "grammar", evidenceType: "E2E", score: 0.4, confidence: 1 },
  });

  const complete = await page.request.post(`/api/learning-sessions/${sessionId}/complete`);
  const completed = await complete.json() as { nextAction: { kind: string; goal: string } | null };
  expect(completed.nextAction).toMatchObject({ kind: "PRACTICE" });

  await page.goto(`/learner/session/${sessionId}`);
  await page.getByRole("button", { name: "Luyện lại phần này" }).click();
  const practiceId = await waitForNewSession(page, sessionId);
  const practice = await db.learningSession.findUniqueOrThrow({ where: { id: practiceId } });
  const state = JSON.parse(practice.stateJson) as { learnerGoal: string };
  expect(practice.userId).toBe(user.id);
  expect(practice.mode).toBe("MISSION");
  expect(practice.goal).toBe(completed.nextAction?.goal);
  expect(state.learnerGoal).toBe(completed.nextAction?.goal);
});
