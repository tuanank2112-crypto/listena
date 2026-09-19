import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../src/lib/prisma";

/**
 * Plan20 SPEC-P202: "Từ yếu" reports what server grading already recorded, and
 * reveals nothing about another learner's words.
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

test("the vocabulary review route rejects anonymous callers", async ({ request }) => {
  expect((await request.get("/api/learner/vocabulary-review")).status()).toBe(401);
});

test("a learner sees the words they keep missing, worst first, and can re-check a random group", async ({ page }) => {
  const learner = await login(page);
  const suffix = randomUUID().slice(0, 8);

  const often = await db.vocabularyItem.create({
    data: { lemma: `often-${suffix}`, displayText: `often${suffix}`, meaningVi: "hay sai nhiều" },
  });
  const once = await db.vocabularyItem.create({
    data: { lemma: `once-${suffix}`, displayText: `once${suffix}`, meaningVi: "sai một lần" },
  });
  const clean = await db.vocabularyItem.create({
    data: { lemma: `clean-${suffix}`, displayText: `clean${suffix}`, meaningVi: "chưa sai lần nào" },
  });
  await db.vocabularyMastery.createMany({
    data: [
      { userId: learner.id, vocabularyItemId: often.id, correctCount: 1, incorrectCount: 4, masteryScore: 0.1 },
      { userId: learner.id, vocabularyItemId: once.id, correctCount: 3, incorrectCount: 1, masteryScore: 0.6 },
      { userId: learner.id, vocabularyItemId: clean.id, correctCount: 3, incorrectCount: 0, masteryScore: 0.9 },
    ],
  });

  try {
    await page.goto("/learner/vocabulary");

    const weak = page.getByRole("region", { name: "Từ hay sai" }).or(page.locator("section[aria-labelledby='weak-words-heading']"));
    await expect(weak.getByText(often.displayText)).toBeVisible();
    await expect(weak.getByText(once.displayText)).toBeVisible();
    // A word never answered wrong is not a weak word.
    await expect(weak.getByText(clean.displayText)).toHaveCount(0);

    // Worst first: the word missed four times is listed above the one missed once.
    const listed = await weak.locator("li p.font-black").allInnerTexts();
    expect(listed.indexOf(often.displayText)).toBeLessThan(listed.indexOf(once.displayText));

    // The random group hides its meanings until the learner asks.
    const random = page.locator("section[aria-labelledby='random-review-heading']");
    const cards = random.locator("li");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
    const firstCard = cards.first();
    const reveal = firstCard.getByRole("button", { name: "Xem nghĩa" });
    await expect(reveal).toBeVisible();
    await expect(reveal).toHaveAttribute("aria-expanded", "false");
    await reveal.click();
    // That card now shows a meaning, and only that card opened.
    await expect(firstCard.getByRole("button", { name: "Xem nghĩa" })).toHaveCount(0);
    await expect(firstCard.locator("button[aria-expanded='true']")).toBeVisible();
    await expect(random.getByRole("button", { name: "Xem nghĩa" })).toHaveCount(cardCount - 1);
  } finally {
    await db.vocabularyMastery.deleteMany({ where: { userId: learner.id, vocabularyItemId: { in: [often.id, once.id, clean.id] } } });
    await db.vocabularyItem.deleteMany({ where: { id: { in: [often.id, once.id, clean.id] } } });
  }
});

test("one learner's weak words never reach another learner", async ({ page }) => {
  const learner = await login(page);
  const suffix = randomUUID().slice(0, 8);

  const otherUser = await db.user.create({
    data: {
      email: `other-${suffix}@example.com`,
      name: "Other learner",
      password: "not-a-login",
      emailVerifiedAt: new Date(),
    },
  });
  const secret = await db.vocabularyItem.create({
    data: { lemma: `secret-${suffix}`, displayText: `secret${suffix}`, meaningVi: "của người khác" },
  });
  await db.vocabularyMastery.create({
    data: { userId: otherUser.id, vocabularyItemId: secret.id, correctCount: 0, incorrectCount: 9 },
  });

  try {
    const body = await (await page.request.get("/api/learner/vocabulary-review")).json();
    const words = [...body.weakWords, ...body.randomReview].map((word: { displayText: string }) => word.displayText);
    expect(words).not.toContain(secret.displayText);
    expect(learner.id).not.toBe(otherUser.id);
  } finally {
    await db.vocabularyMastery.deleteMany({ where: { userId: otherUser.id } });
    await db.vocabularyItem.deleteMany({ where: { id: secret.id } });
    await db.user.deleteMany({ where: { id: otherUser.id } });
  }
});
