import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma as db } from "../src/lib/prisma";

test.afterAll(async () => db.$disconnect());

async function createAndLoginLearner(page: Page) {
  const suffix = randomUUID();
  const email = `memory-${suffix}@example.com`;
  const user = await db.user.create({
    data: {
      name: "Memory test learner",
      email,
      password: await hash("memory-test-password", 10),
      role: "LEARNER",
      learnerProfile: { create: {} },
    },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("memory-test-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
  return user;
}

test("a committed turn links one memory increment to its exact evidence and retry is idempotent", async ({ page }) => {
  const user = await createAndLoginLearner(page);
  const create = await page.request.post("/api/learning-sessions", {
    data: { clientStartId: randomUUID(), mode: "MISSION", scenarioKey: "lost-luggage" },
  });
  expect(create.status()).toBe(201);
  const { session } = await create.json();
  const payload = {
    clientTurnId: randomUUID(),
    content: "I lost my black suitcase today",
  };

  expect((await page.request.post(`/api/learning-sessions/${session.id}/turns`, { data: payload })).ok()).toBe(true);
  expect((await page.request.post(`/api/learning-sessions/${session.id}/turns`, { data: payload })).ok()).toBe(true);

  const evidence = await db.learningEvidence.findMany({ where: { sessionId: session.id } });
  const memory = await db.learnerMemory.findUniqueOrThrow({ where: { userId: user.id } });
  expect(evidence).toHaveLength(1);
  expect(JSON.parse(memory.skillsJson)).toEqual([expect.objectContaining({
    skillKey: evidence[0].skillKey,
    evidenceCount: 1,
    lastEvidenceId: evidence[0].id,
  })]);
  expect((await db.skillMastery.findUniqueOrThrow({
    where: { userId_skillKey: { userId: user.id, skillKey: evidence[0].skillKey } },
  })).evidenceCount).toBe(1);
});

test("a learner-memory write failure rolls back the turn, evidence, and mastery", async ({ page }) => {
  const user = await createAndLoginLearner(page);
  const create = await page.request.post("/api/learning-sessions", {
    data: { clientStartId: randomUUID(), mode: "MISSION", scenarioKey: "lost-luggage" },
  });
  expect(create.status()).toBe(201);
  const { session } = await create.json();
  await db.$executeRawUnsafe(
    "CREATE TRIGGER memory_write_abort BEFORE INSERT ON LearnerMemory BEGIN SELECT RAISE(ABORT, 'memory write blocked'); END;",
  );

  try {
    const response = await page.request.post(`/api/learning-sessions/${session.id}/turns`, {
      data: { clientTurnId: randomUUID(), content: "I lost my black suitcase today" },
    });
    expect(response.status()).toBe(500);
    expect(await db.learningTurn.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await db.learningEvidence.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await db.skillMastery.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.learnerMemory.count({ where: { userId: user.id } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER IF EXISTS memory_write_abort");
  }
});
