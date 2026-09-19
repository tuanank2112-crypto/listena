import { expect, test, type Page } from "@playwright/test";
import { prisma as db } from "../src/lib/prisma";

test.afterAll(async () => db.$disconnect());

/**
 * Plan14 Voice AI: the session player offers a microphone when the browser has
 * a recogniser, the transcript lands in the reply box, every AI turn carries a
 * server-curated voice script, and pronunciation practice is graded on the
 * server and only recorded for lines the AI actually modelled.
 *
 * The browser recogniser is replaced by a deterministic stub: no audio, no
 * microphone permission and no network are involved.
 */
const STUB_TRANSCRIPT = "My suitcase is black and large.";

async function installRecognitionStub(page: Page) {
  await page.addInitScript((transcript) => {
    class StubRecognition {
      lang = "";
      continuous = true;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const item = { isFinal: true, length: 1, 0: { transcript, confidence: 0.93 } };
          this.onresult?.({ resultIndex: 0, results: { length: 1, 0: item } });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "webkitSpeechRecognition", { value: StubRecognition, configurable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: StubRecognition, configurable: true });
  }, STUB_TRANSCRIPT);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("learner@example.com");
  await page.getByLabel("Mật khẩu").fill("demo1234");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/learner\/dashboard$/);
}

/**
 * Earlier specs may leave this learner with an open Mission; the start button
 * then offers "resume or start new" (Plan13 replaceActive) instead of
 * navigating. Always take the explicit "start new" path.
 */
async function startMission(page: Page) {
  // Deterministic reset: close whatever earlier specs left open for the shared
  // seeded learner so the start button navigates instead of asking.
  await db.learningSession.updateMany({
    where: { user: { email: "learner@example.com" }, status: "ACTIVE" },
    data: { status: "ABANDONED", completedAt: new Date() },
  });
  await page.goto("/learner/games");
  await page.getByRole("button", { name: "Vào vai" }).first().click();
  const startNew = page.getByRole("button", { name: "Bắt đầu phiên mới" });
  await Promise.race([
    page.waitForURL(/\/learner\/session\/[0-9a-f-]+$/, { timeout: 20_000 }),
    startNew.waitFor({ state: "visible", timeout: 20_000 }),
  ]);
  if (!/\/learner\/session\//.test(page.url())) await startNew.click();
  await expect(page).toHaveURL(/\/learner\/session\/[0-9a-f-]+$/);
}

test("voice input fills the reply and the AI turn ships a curated voice script", async ({ page }) => {
  await installRecognitionStub(page);
  await login(page);

  await startMission(page);
  const sessionId = page.url().split("/").pop()!;

  // Voice settings panel is reachable and describes the policy.
  await page.getByRole("button", { name: "Cài đặt giọng nói" }).click();
  await expect(page.getByRole("region", { name: "Cài đặt giọng nói" })).toBeVisible();
  await expect(page.getByLabel("Accent tiếng Anh")).toHaveValue("en-US");
  await page.getByRole("button", { name: "Cài đặt giọng nói" }).click();

  // Speak to reply: the stubbed transcript lands in the textarea.
  await page.getByRole("button", { name: "Nói để trả lời" }).click();
  await expect(page.getByLabel("Trả lời nhân vật AI")).toHaveValue(STUB_TRANSCRIPT);
  await page.getByRole("button", { name: "Gửi câu trả lời" }).click();
  await expect(page.getByText(STUB_TRANSCRIPT, { exact: true })).toBeVisible();

  // The persisted session exposes a server-curated script on every AI turn and
  // never on learner turns.
  const sessionResponse = await page.request.get(`/api/learning-sessions/${sessionId}`);
  expect(sessionResponse.ok()).toBe(true);
  const { session } = (await sessionResponse.json()) as {
    session: { turns: Array<{ actor: string; voiceScript?: { version: string; lines: Array<{ role: string; lang: string; text: string; rate: number }> } | null }> };
  };
  const aiTurns = session.turns.filter((turn) => turn.actor === "AI");
  expect(aiTurns.length).toBeGreaterThan(0);
  for (const turn of aiTurns) {
    expect(turn.voiceScript?.version).toBe("v1");
    expect(turn.voiceScript?.lines.some((line) => line.role === "NPC" && line.lang === "en")).toBe(true);
    for (const line of turn.voiceScript?.lines ?? []) expect(line.text).toMatch(/[.!?]["')\]]*$/);
  }
  for (const turn of session.turns.filter((item) => item.actor === "LEARNER")) {
    expect(turn.voiceScript).toBeUndefined();
  }

  // Pronunciation practice: a modelled NPC line is graded and recorded.
  const modelled = aiTurns[0].voiceScript!.lines.find((line) => line.role === "NPC")!.text;
  const graded = await page.request.post("/api/voice/pronunciation", {
    data: { clientAttemptId: crypto.randomUUID(), expected: modelled, transcript: modelled.toLowerCase(), recognitionConfidence: 0.9, sessionId },
  });
  expect(graded.status()).toBe(200);
  const outcome = (await graded.json()) as { recorded: boolean; result: { verdict: string; score: number } };
  expect(outcome.recorded).toBe(true);
  expect(outcome.result.verdict).toBe("GOOD");
  expect(outcome.result.score).toBe(1);

  // A line the AI never modelled cannot mint evidence for this session.
  const rejected = await page.request.post("/api/voice/pronunciation", {
    data: { clientAttemptId: crypto.randomUUID(), expected: "Give me your passport right now.", transcript: "give me", sessionId },
  });
  expect(rejected.status()).toBe(400);
  expect(await rejected.json()).toMatchObject({ code: "EXPECTED_NOT_IN_SESSION" });

  // Without a session the grade is returned and nothing is stored.
  const free = await page.request.post("/api/voice/pronunciation", {
    data: { clientAttemptId: crypto.randomUUID(), expected: "Good morning.", transcript: "" },
  });
  expect(free.status()).toBe(200);
  expect(await free.json()).toMatchObject({ recorded: false, result: { verdict: "RETRY", score: 0 } });

  // The public events route refuses to record a voice score directly.
  const direct = await page.request.post(`/api/learning-sessions/${sessionId}/events`, {
    data: { type: "VOICE_PRACTICE", value: 100, clientEventId: `spoof-${crypto.randomUUID()}` },
  });
  expect(direct.status()).toBe(400);
});

test("without a recogniser the typed path stays and the settings explain it", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
  });
  await login(page);
  await startMission(page);

  await expect(page.getByRole("button", { name: "Nói để trả lời" })).toHaveCount(0);
  await expect(page.getByLabel("Trả lời nhân vật AI")).toBeVisible();
  await page.getByRole("button", { name: "Cài đặt giọng nói" }).click();
  await expect(page.getByText(/chưa hỗ trợ nói để trả lời/)).toBeVisible();
});

// Plan18 SPEC-P181: the device voice picker must render and pin a voice with no
// AI key configured. Headless Chromium usually reports zero voices, so the test
// installs a deterministic list the same way a real device would expose one.
test("the learner can pick and keep a device voice without any AI key", async ({ page }) => {
  await page.addInitScript(() => {
    const voices = [
      { name: "Microsoft Andrew Online (Natural) - English (United States)", voiceURI: "andrew-uri", lang: "en-US", default: false, localService: false },
      { name: "Microsoft Ava Online (Natural) - English (United States)", voiceURI: "ava-uri", lang: "en-US", default: false, localService: false },
      { name: "Microsoft Zira - English (United States)", voiceURI: "zira-uri", lang: "en-US", default: true, localService: true },
    ];
    Object.defineProperty(window.speechSynthesis, "getVoices", { value: () => voices, configurable: true });
  });
  await login(page);
  await startMission(page);

  await page.getByRole("button", { name: "Cài đặt giọng nói" }).click();
  const picker = page.getByRole("group", { name: "Giọng tiếng Anh trên thiết bị này" });
  await expect(picker).toBeVisible();
  // The curated catalogue must put Ava ahead of the alphabetically earlier Andrew.
  await expect(picker.getByRole("button", { name: "Nghe thử Ava" })).toBeVisible();
  const auto = picker.getByRole("button", { name: /Tự động/ });
  await expect(auto).toHaveAttribute("aria-pressed", "true");

  const ava = picker.getByRole("button", { name: /^Ava/ });
  await ava.click();
  await expect(ava).toHaveAttribute("aria-pressed", "true");
  await expect(auto).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await page.getByRole("button", { name: "Cài đặt giọng nói" }).click();
  await expect(picker.getByRole("button", { name: /^Ava/ })).toHaveAttribute("aria-pressed", "true");
});

// Plan18 SPEC-P183: the picker must be reachable without starting a Mission.
test("the voice page lets a learner choose a voice without starting a Mission", async ({ page }) => {
  await page.addInitScript(() => {
    const voices = [
      { name: "Microsoft Andrew Online (Natural) - English (United States)", voiceURI: "andrew-uri", lang: "en-US", default: false, localService: false },
      { name: "Microsoft Ava Online (Natural) - English (United States)", voiceURI: "ava-uri", lang: "en-US", default: false, localService: false },
    ];
    Object.defineProperty(window.speechSynthesis, "getVoices", { value: () => voices, configurable: true });
  });
  await login(page);

  await page.getByRole("link", { name: "Giọng nói" }).first().click();
  await expect(page).toHaveURL(/\/learner\/settings$/);

  const picker = page.getByRole("group", { name: "Giọng tiếng Anh trên thiết bị này" });
  await expect(picker).toBeVisible();
  const ava = picker.getByRole("button", { name: /^Ava/ });
  await ava.click();
  await expect(ava).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(picker.getByRole("button", { name: /^Ava/ })).toHaveAttribute("aria-pressed", "true");

  // A <fieldset> defaults to min-inline-size: min-content, so the voice rows used
  // to push the page 178px wider than a phone viewport (Plan18 F-01).
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(picker).toBeVisible();
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});

test("pronunciation grading requires authentication", async ({ request }) => {
  const response = await request.post("/api/voice/pronunciation", {
    data: { clientAttemptId: crypto.randomUUID(), expected: "Hello.", transcript: "hello" },
  });
  expect(response.status()).toBe(401);
});
