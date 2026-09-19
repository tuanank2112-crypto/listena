import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../src/lib/prisma";

/**
 * Plan21 SPEC-P214: the learner reads back their own corrections, named in
 * Vietnamese, and one learner never sees another's.
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

/**
 * A session holding the exchange the service writes: what the learner sent,
 * then the AI turn correcting it.
 */
async function seedCorrection(
  userId: string,
  learnerMessage: string,
  detectedError: { type: string; actual: string; explanationVi: string },
  goal: string,
) {
  const session = await db.learningSession.create({
    data: { userId, mode: "MISSION", status: "COMPLETED", goal, completedAt: new Date() },
  });
  await db.learningTurn.create({
    data: {
      sessionId: session.id,
      sequence: 1,
      clientTurnId: randomUUID(),
      actor: "LEARNER",
      turnType: "RESPONSE",
      contentJson: JSON.stringify({ message: learnerMessage, responseTimeMs: 12_000 }),
    },
  });
  await db.learningTurn.create({
    data: {
      sessionId: session.id,
      sequence: 2,
      clientTurnId: randomUUID(),
      actor: "AI",
      turnType: "COACH",
      contentJson: JSON.stringify({ npcReply: "…", coachMessage: "…", detectedError }),
    },
  });
  return session.id;
}

test("the mistakes route rejects anonymous callers", async ({ request }) => {
  expect((await request.get("/api/learner/mistakes")).status()).toBe(401);
});

test("a learner reads their own corrections grouped and named in Vietnamese", async ({ page }) => {
  const learner = await login(page);
  const suffix = randomUUID().slice(0, 8);
  const sentenceOne = `I lose my bag ${suffix}`;
  const sentenceTwo = `yesterday I go there ${suffix}`;

  // The model names the same mistake two different ways, and on the second turn
  // it describes the mistake instead of quoting it — both shapes come from
  // production.
  const sessions = [
    await seedCorrection(learner.id, sentenceOne, { type: "tense", actual: "lose", explanationVi: "Dùng quá khứ đơn: I lost." }, `Sân bay ${suffix}`),
    await seedCorrection(learner.id, sentenceTwo, { type: "verb_tense", actual: "present tense with incorrect verb form", explanationVi: "Yesterday đi với quá khứ." }, `Quán ăn ${suffix}`),
  ];

  try {
    const body = await (await page.request.get("/api/learner/mistakes")).json();
    const tense = body.families.find((family: { key: string }) => family.key === "tense");
    expect(tense).toBeTruthy();
    expect(tense.labelVi).toBe("Thì của động từ");

    const texts = tense.examples.map((example: { learnerText: string }) => example.learnerText);
    expect(texts).toContain(sentenceOne);
    expect(texts).toContain(sentenceTwo);

    // A genuine fragment is marked; a description of the mistake is not.
    const quoted = tense.examples.find((example: { learnerText: string }) => example.learnerText === sentenceOne);
    const described = tense.examples.find((example: { learnerText: string }) => example.learnerText === sentenceTwo);
    expect(quoted.highlights).toEqual(["lose"]);
    expect(described.highlights).toEqual([]);

    await page.goto("/learner/progress");
    const panel = page.locator("section[aria-labelledby='mistakes-heading']");
    await expect(panel.getByText("Thì của động từ")).toBeVisible();
    // The panel must never print the model's English type name, nor its prose
    // description dressed up as something the learner wrote.
    await expect(panel.getByText("verb_tense")).toHaveCount(0);
    await expect(panel.getByText("present tense with incorrect verb form")).toHaveCount(0);
    // The first family opens by default, showing the learner's own sentence.
    await expect(panel.getByText(sentenceOne)).toBeVisible();
  } finally {
    await db.learningSession.deleteMany({ where: { id: { in: sessions } } });
  }
});

test("one learner's corrections never reach another", async ({ page }) => {
  const learner = await login(page);
  const suffix = randomUUID().slice(0, 8);
  const other = await db.user.create({
    data: {
      email: `mistakes-other-${suffix}@example.com`,
      name: "Other learner",
      password: "not-a-login",
      emailVerifiedAt: new Date(),
    },
  });
  const secret = `private sentence ${suffix}`;
  await seedCorrection(other.id, secret, { type: "article", actual: "private", explanationVi: "Riêng tư." }, `Riêng ${suffix}`);

  try {
    const body = await (await page.request.get("/api/learner/mistakes")).json();
    const everything = JSON.stringify(body);
    expect(everything).not.toContain(secret);
    expect(learner.id).not.toBe(other.id);
  } finally {
    await db.learningSession.deleteMany({ where: { userId: other.id } });
    await db.user.deleteMany({ where: { id: other.id } });
  }
});
