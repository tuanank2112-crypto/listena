import { expect, test } from "@playwright/test";

test("landing page loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/ListenAI/i);
  await expect(page.getByRole("heading", { name: /Học ít hơn/i })).toBeVisible();
});

test("login page loads", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveURL(/\/login(\?.*)?$/);
  await expect(page.getByRole("heading", { name: /Tiếp tục học/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Đăng nhập/i })).toBeVisible();
});

test("unauthenticated learner route redirects to login", async ({ page }) => {
  await page.goto("/learner/dashboard");

  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

test("learning session API rejects unauthenticated access", async ({ request }) => {
  const createResponse = await request.post("/api/learning-sessions", {
    data: { mode: "MISSION" },
  });
  const readResponse = await request.get(
    "/api/learning-sessions/00000000-0000-4000-8000-000000000000",
  );

  expect(createResponse.status()).toBe(401);
  expect(await createResponse.json()).toEqual({ error: "Unauthorized" });
  expect(readResponse.status()).toBe(401);
  expect(await readResponse.json()).toEqual({ error: "Unauthorized" });
});

test("learner completes and resumes an AI mission turn", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);

  await page.goto("/learner/games");
  await page.getByRole("button", { name: "Vào vai" }).first().click();
  await expect(page).toHaveURL(/\/learner\/session\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "The Missing Suitcase" })).toBeVisible();

  const answer = "My suitcase is black and large.";
  await page.getByLabel("Trả lời nhân vật AI").fill(answer);
  await page.getByRole("button", { name: "Gửi câu trả lời" }).click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText(/Thank you|Good|understand/i).last()).toBeVisible();

  await page.reload();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
});
