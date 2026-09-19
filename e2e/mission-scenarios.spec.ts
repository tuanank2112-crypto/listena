import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../src/lib/prisma";

/**
 * Plan23: a learner's own mission scenarios are theirs alone and playable, and
 * the Coach's explanation waits to be asked for.
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

/** A scenario as the generator writes it, without spending an AI call. */
async function seedScenario(userId: string, title: string) {
  return db.learnerMissionScenario.create({
    data: {
      userId,
      sourcePrompt: `Tình huống ${title}`,
      title,
      npcName: "Mai",
      npcRole: "delivery driver",
      learnerGoal: "Explain what is missing and ask for it to be fixed.",
      openingLine: "Sorry I am late. Here is your order.",
      firstPrompt: "Can you tell me what is missing?",
      targetVocabularyJson: JSON.stringify(["order", "missing", "receipt"]),
      targetGrammarJson: JSON.stringify(["present perfect"]),
      maxTurns: 7,
    },
  });
}

test("the scenario routes reject anonymous callers", async ({ request }) => {
  expect((await request.get("/api/learner/mission-scenarios")).status()).toBe(401);
  expect((await request.post("/api/learner/mission-scenarios", { data: { prompt: "gọi món ở tiệm bánh mì" } })).status()).toBe(401);
  expect((await request.delete(`/api/learner/mission-scenarios/${randomUUID()}`)).status()).toBe(401);
});

test("a learner sees and can remove their own scenarios, and never another's", async ({ page }) => {
  const learner = await login(page);
  const suffix = randomUUID().slice(0, 8);
  const mine = await seedScenario(learner.id, `Chủ đề của tôi ${suffix}`);

  const other = await db.user.create({
    data: {
      email: `scenario-other-${suffix}@example.com`,
      name: "Other learner",
      password: "not-a-login",
      emailVerifiedAt: new Date(),
    },
  });
  const theirs = await seedScenario(other.id, `Chủ đề người khác ${suffix}`);

  try {
    const body = await (await page.request.get("/api/learner/mission-scenarios")).json();
    const titles = body.scenarios.map((scenario: { title: string }) => scenario.title);
    expect(titles).toContain(`Chủ đề của tôi ${suffix}`);
    expect(titles).not.toContain(`Chủ đề người khác ${suffix}`);

    // Deleting somebody else's answers exactly like deleting one that is gone.
    expect((await page.request.delete(`/api/learner/mission-scenarios/${theirs.id}`)).status()).toBe(404);
    expect(await db.learnerMissionScenario.findFirst({ where: { id: theirs.id, archivedAt: null } })).not.toBeNull();

    await page.goto("/learner/games");
    const section = page.locator("section[aria-labelledby='my-scenarios-heading']");
    await expect(section.getByRole("heading", { name: `Chủ đề của tôi ${suffix}` })).toBeVisible();

    expect((await page.request.delete(`/api/learner/mission-scenarios/${mine.id}`)).status()).toBe(200);
    const after = await (await page.request.get("/api/learner/mission-scenarios")).json();
    expect(after.scenarios.map((scenario: { id: string }) => scenario.id)).not.toContain(mine.id);
  } finally {
    await db.learnerMissionScenario.deleteMany({ where: { userId: { in: [learner.id, other.id] } } });
    await db.user.deleteMany({ where: { id: other.id } });
  }
});

test("a learner can start a Mission on their own scenario, but not on somebody else's", async ({ page }) => {
  const learner = await login(page);
  const suffix = randomUUID().slice(0, 8);
  const mine = await seedScenario(learner.id, `Giao hàng trễ ${suffix}`);

  const other = await db.user.create({
    data: {
      email: `scenario-start-${suffix}@example.com`,
      name: "Other learner",
      password: "not-a-login",
      emailVerifiedAt: new Date(),
    },
  });
  const theirs = await seedScenario(other.id, `Riêng tư ${suffix}`);

  try {
    // Close whatever an earlier spec left open for the shared seeded learner.
    await db.learningSession.updateMany({
      where: { userId: learner.id, status: "ACTIVE" },
      data: { status: "ABANDONED", completedAt: new Date() },
    });

    const denied = await page.request.post("/api/learning-sessions", {
      data: { clientStartId: randomUUID(), mode: "MISSION", scenarioKey: `custom-${theirs.id}`, replaceActive: true },
    });
    expect(denied.status()).toBe(404);

    const started = await page.request.post("/api/learning-sessions", {
      data: { clientStartId: randomUUID(), mode: "MISSION", scenarioKey: `custom-${mine.id}`, replaceActive: true },
    });
    expect(started.status()).toBeLessThan(300);
    const body = await started.json();
    const session = body.session ?? body;
    expect(session.mode).toBe("MISSION");
  } finally {
    // Abandon rather than delete: a started session owns turns, evidence and a
    // start-request ledger, and this test is not a place to exercise cascades.
    await db.learningSession.updateMany({
      where: { userId: learner.id, status: "ACTIVE" },
      data: { status: "ABANDONED", completedAt: new Date() },
    });
    await db.learnerMissionScenario.deleteMany({ where: { userId: { in: [learner.id, other.id] } } });
    await db.user.deleteMany({ where: { id: other.id } });
  }
});
