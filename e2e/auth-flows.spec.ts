import { expect, test, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma as db } from "../src/lib/prisma";

/**
 * Plan13 P130 auth flows against the isolated E2E database.
 *
 * Action tokens are stored only as SHA-256 digests, and the mail provider is
 * not configured here, so a test cannot read a link from an inbox. Instead
 * each flow waits for the route's `after()` work to issue its token row, then
 * swaps that row's digest for one whose raw value the test knows. Everything
 * else (issue, consume, single use, expiry) runs the production code path.
 */

const PASSWORD = "demo1234";
const NEW_PASSWORD = "reset-pass-9876";

const registerEmail = "auth-flow-register@example.com";
const resetEmail = "auth-flow-reset@example.com";
const lockEmail = "auth-flow-lock@example.com";
const teacherEmail = "auth-flow-teacher@example.com";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function freshRawToken() {
  return randomBytes(32).toString("base64url");
}

async function cleanupUsers() {
  await db.user.deleteMany({
    where: { email: { in: [registerEmail, resetEmail, lockEmail, teacherEmail] } },
  });
}

/**
 * Waits for the after-response token issue, then re-keys the newest active
 * row of that purpose to a raw token the test controls.
 */
async function takeOverActionToken(userId: string, purpose: "VERIFY_EMAIL" | "PASSWORD_RESET") {
  await expect
    .poll(() => db.accountActionToken.count({ where: { userId, purpose, consumedAt: null } }), {
      timeout: 15_000,
      message: `${purpose} token was not issued after the response`,
    })
    .toBeGreaterThan(0);

  const row = await db.accountActionToken.findFirstOrThrow({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const rawToken = freshRawToken();
  await db.accountActionToken.update({
    where: { id: row.id },
    data: { tokenHash: sha256(rawToken) },
  });
  return rawToken;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test.beforeAll(async () => {
  await cleanupUsers();
  const passwordHash = await hash(PASSWORD, 10);
  await db.user.create({
    data: {
      email: resetEmail,
      name: "Reset Flow",
      password: passwordHash,
      role: "LEARNER",
      emailVerifiedAt: new Date(),
      learnerProfile: { create: { estimatedCefrLevel: "A2", listeningMastery: 0.5, vocabularyMastery: 0.5 } },
    },
  });
  await db.user.create({
    data: {
      email: lockEmail,
      name: "Lock Flow",
      password: passwordHash,
      role: "LEARNER",
      emailVerifiedAt: new Date(),
      learnerProfile: { create: { estimatedCefrLevel: "A2", listeningMastery: 0.5, vocabularyMastery: 0.5 } },
    },
  });
  await db.user.create({
    data: {
      email: teacherEmail,
      name: "Teacher Flow",
      password: passwordHash,
      role: "TEACHER",
      emailVerifiedAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  // The IP counter is shared by every spec in this run; leave nothing behind.
  await db.authAttempt.deleteMany({});
  await cleanupUsers();
  await db.$disconnect();
});

test.describe("Plan13 P130 — auth flows", () => {
  test("register -> verify link -> login -> logout -> learner route redirects to /login", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Họ tên").fill("Register Flow");
    await page.getByLabel("Email").fill(registerEmail);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();

    await expect(page.getByText("Yêu cầu đã được ghi nhận.")).toBeVisible();

    const user = await db.user.findUniqueOrThrow({ where: { email: registerEmail } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.role).toBe("LEARNER");

    // Unverified: login is refused with the verification prompt.
    await login(page, registerEmail, PASSWORD);
    await expect(page.getByText("Bạn cần xác thực email trước khi đăng nhập.")).toBeVisible();

    const rawToken = await takeOverActionToken(user.id, "VERIFY_EMAIL");
    await page.goto(`/verify-email?token=${rawToken}`);
    await expect(page.getByRole("link", { name: /Đăng nhập/ }).first()).toBeVisible();
    await expect
      .poll(async () => (await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt)
      .not.toBeNull();

    await login(page, registerEmail, PASSWORD);
    await expect(page).toHaveURL(/\/learner\/dashboard$/);

    // Logout from the desktop control, then the protected route must bounce.
    await page.getByTestId("sign-out-desktop").click();
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.get("/learner/dashboard", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/login/);
    await page.goto("/learner/dashboard");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  test("register with an existing email answers exactly like a new one", async ({ request }) => {
    const existing = await request.post("/api/register", {
      data: { name: "Someone", email: resetEmail, password: PASSWORD },
    });
    const fresh = await request.post("/api/register", {
      data: { name: "Someone", email: "auth-flow-never-used@example.com", password: PASSWORD },
    });

    expect(existing.status()).toBe(202);
    expect(fresh.status()).toBe(202);
    expect(await existing.json()).toEqual(await fresh.json());
    await db.user.deleteMany({ where: { email: "auth-flow-never-used@example.com" } });
  });

  test("forgot password -> reset link -> login with the new password", async ({ page }) => {
    const user = await db.user.findUniqueOrThrow({ where: { email: resetEmail } });

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Gửi liên kết đặt lại" }).click();
    await expect(page.getByText("Hãy kiểm tra hộp thư của bạn.")).toBeVisible();

    const rawToken = await takeOverActionToken(user.id, "PASSWORD_RESET");
    await page.goto(`/reset-password?token=${rawToken}`);
    await page.getByLabel("Mật khẩu mới", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Nhập lại mật khẩu mới").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
    await expect(page.getByText("Bạn có thể đăng nhập lại.")).toBeVisible();

    await login(page, resetEmail, PASSWORD);
    await expect(page.getByText("Email hoặc mật khẩu chưa đúng.")).toBeVisible();

    await login(page, resetEmail, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/learner\/dashboard$/);
  });

  test("five wrong passwords lock the account: the correct password is refused with a neutral message", async ({ page }) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(page, lockEmail, `wrong-${attempt}`);
      await expect(page.getByText("Email hoặc mật khẩu chưa đúng.")).toBeVisible();
    }

    await login(page, lockEmail, PASSWORD);
    await expect(page.getByText(/Đăng nhập tạm thời bị khoá/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    const emailRow = await db.authAttempt.findUniqueOrThrow({
      where: { subjectKind_subject: { subjectKind: "EMAIL", subject: sha256(lockEmail) } },
    });
    expect(emailRow.failedCount).toBe(5);
    expect(emailRow.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // Expire the lock the way time would, then the correct password works.
    await db.authAttempt.update({
      where: { id: emailRow.id },
      data: { lockedUntil: new Date(Date.now() - 1_000), windowStartedAt: new Date(Date.now() - 11 * 60_000) },
    });
    await login(page, lockEmail, PASSWORD);
    await expect(page).toHaveURL(/\/learner\/dashboard$/);
    await expect
      .poll(() => db.authAttempt.count({ where: { subjectKind: "EMAIL", subject: sha256(lockEmail) } }))
      .toBe(0);
  });

  test("a TEACHER session is refused on /api/attempt with 403 ROLE_FORBIDDEN", async ({ page }) => {
    await login(page, teacherEmail, PASSWORD);
    await expect(page).toHaveURL(/\/teacher/);

    const response = await page.request.post("/api/attempt", {
      data: {
        exerciseId: "00000000-0000-4000-8000-000000000000",
        lessonId: "00000000-0000-4000-8000-000000000000",
        clientAttemptId: "00000000-0000-4000-8000-000000000001",
        answer: "anything",
      },
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ROLE_FORBIDDEN" });
  });
});
