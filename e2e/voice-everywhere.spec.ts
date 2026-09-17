import { expect, test, type Page } from "@playwright/test";

/**
 * Plan15: listening is available on every learner surface, and the AI voice
 * (ElevenLabs) degrades cleanly when no key is configured, which is the case
 * in this isolated E2E environment.
 */
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
}

test("voice capability probe reports no AI voice without a key and stays private", async ({ page }) => {
  await login(page);
  const response = await page.request.get("/api/voice/tts");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ enabled: false, voices: { "en-US": [], "en-GB": [], vi: [] } });

  const synth = await page.request.post("/api/voice/tts", { data: { text: "Hello.", lang: "en" } });
  expect(synth.status()).toBe(503);
  expect(await synth.json()).toMatchObject({ code: "VOICE_NOT_CONFIGURED" });
});

test("voice routes reject anonymous callers", async ({ request }) => {
  expect((await request.get("/api/voice/tts")).status()).toBe(401);
  expect((await request.post("/api/voice/tts", { data: { text: "Hello.", lang: "en" } })).status()).toBe(401);
  const audio = await request.get("/api/game-runs/00000000-0000-4000-8000-000000000000/rounds/00000000-0000-4000-8000-000000000001/audio");
  expect(audio.status()).toBe(401);
});

test("quiz rounds offer a listen button and spelling rounds explain a missing AI voice", async ({ page }) => {
  await login(page);
  await page.goto("/learner/games");

  await page.getByRole("button", { name: /Chọn nhanh/ }).click();
  await expect(page.getByRole("button", { name: "Nghe từ" })).toBeVisible({ timeout: 20_000 });

  // Game runs have a 10 s creation cooldown per learner (run-budget.ts).
  await page.waitForTimeout(10_500);
  await page.goto("/learner/games");
  await page.getByRole("button", { name: /Nghe & viết/ }).click();
  const hidden = page.getByRole("button", { name: "Nghe từ cần viết" });
  await expect(hidden).toBeVisible({ timeout: 20_000 });
  // Without an ElevenLabs key the server answers 503 and the learner is told
  // the spelling hint still works; the answer text never reached the browser.
  await expect(page.getByText(/Giọng AI chưa được cấu hình/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder("Gõ từ tiếng Anh")).toBeVisible();
});
