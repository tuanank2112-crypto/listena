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
