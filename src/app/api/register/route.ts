import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { databaseErrorResponse } from "@/lib/database-error-response";
import {
  executeAtomicLibSqlBatch,
  libSqlTimestamp,
  type LibSqlBatchStatement,
} from "@/lib/libsql-batch";
import { prisma } from "@/lib/prisma";
import { issueAccountActionToken } from "@/server/account-actions";
import { sendVerificationEmail } from "@/server/account-email";
import { equalizePasswordWork, padOpaqueResponse } from "@/server/auth/opaque-response";
import { isEmailDeliveryUnavailableError } from "@/server/email";
import { sendAccountExistsEmail } from "@/server/email/account-exists";
import { RegisterSchema } from "@/server/validation/schemas";
import logger from "@/lib/logger";

const INITIAL_SKILLS = [
  "listening",
  "vocabulary",
  "spelling",
  "function_words",
  "segmentation",
  "final_sounds",
] as const;

type RegistrationRecord = {
  id: string;
  name: string;
  email: string;
  role: "LEARNER";
};

/**
 * A libSQL write batch is the compatible transaction boundary for both local
 * SQLite and Turso. It makes the account graph all-or-nothing even if a later
 * profile or mastery insert fails.
 */
async function persistRegistration(input: {
  name: string;
  email: string;
  hashedPassword: string;
  role: "LEARNER";
}): Promise<RegistrationRecord> {
  const now = libSqlTimestamp(new Date());
  const user: RegistrationRecord = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    role: input.role,
  };

  const statements: LibSqlBatchStatement[] = [
    {
      sql: `INSERT INTO "User"
              ("id", "name", "email", "password", "role", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      values: [
        user.id,
        user.name,
        user.email,
        input.hashedPassword,
        user.role,
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO "LearnerProfile"
              ("id", "userId", "estimatedCefrLevel", "listeningMastery", "vocabularyMastery", "spellingMastery", "lastActivityAt", "createdAt", "updatedAt")
            VALUES (?, ?, 'A2', 0.5, 0.5, 0.5, ?, ?, ?)`,
      values: [randomUUID(), user.id, now, now, now],
    },
    ...INITIAL_SKILLS.map((skillKey): LibSqlBatchStatement => ({
      sql: `INSERT INTO "SkillMastery"
              ("id", "userId", "skillKey", "masteryScore", "evidenceCount", "lastUpdatedAt")
            VALUES (?, ?, ?, 0.5, 0, ?)`,
      values: [randomUUID(), user.id, skillKey, now],
    })),
  ];

  await executeAtomicLibSqlBatch(statements);
  return user;
}

function isDuplicateEmailError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:UNIQUE constraint failed:\s*"?User"?\."?email"?|User_email_key)/i.test(message);
}

/**
 * The one response every accepted registration receives. A new account and
 * an already-registered address produce byte-identical envelopes (Plan13 A3);
 * what differs is only the email that reaches the mailbox owner.
 */
const acceptedResponse = () => NextResponse.json(
  { accepted: true, verificationEmailSent: true },
  { status: 202, headers: { "Cache-Control": "no-store" } },
);

function mailFailureReason(error: unknown) {
  return isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown";
}

/** Runs after the response: the first verification link for a new account. */
function scheduleNewAccountEmail(requestUrl: string, user: RegistrationRecord, requestId: string) {
  after(async () => {
    try {
      await equalizePasswordWork();
      const token = await issueAccountActionToken({ userId: user.id, purpose: "VERIFY_EMAIL" });
      if (!token) return;
      await sendVerificationEmail({ requestUrl, recipient: user, rawToken: token.rawToken });
    } catch (error) {
      logger.warn(
        { requestId, userId: user.id, reason: mailFailureReason(error) },
        "Initial verification email delivery unavailable",
      );
    }
  });
}

/**
 * Runs after the response for an address that already has an account. An
 * unverified account gets its verification link again; a verified account
 * gets the "account exists" notice with a one-time reset link. Either way the
 * mailbox owner, and only the mailbox owner, learns that the account exists.
 */
function scheduleExistingAccountEmail(requestUrl: string, email: string, requestId: string) {
  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, emailVerifiedAt: true },
      });
      await equalizePasswordWork();
      if (!user) return;

      if (!user.emailVerifiedAt) {
        const token = await issueAccountActionToken({ userId: user.id, purpose: "VERIFY_EMAIL" });
        if (!token) return;
        await sendVerificationEmail({ requestUrl, recipient: user, rawToken: token.rawToken });
        return;
      }

      const token = await issueAccountActionToken({ userId: user.id, purpose: "PASSWORD_RESET" });
      if (!token) return;
      await sendAccountExistsEmail({ requestUrl, recipient: user, rawToken: token.rawToken });
    } catch (error) {
      logger.warn(
        { requestId, reason: mailFailureReason(error) },
        "Existing-account registration email delivery unavailable",
      );
    }
  });
}

export async function POST(req: Request) {
  const startedAt = performance.now();
  const requestId = randomUUID();
  let submittedEmail: string | undefined;

  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { name, email, password } = parsed.data;
    submittedEmail = email;
    // Public registration never grants a privileged authoring role. Teachers
    // are provisioned through an authenticated administrative workflow.
    const role = "LEARNER" as const;

    // Hash before the existence check so both branches pay the same bcrypt
    // cost; the response is then padded to the shared floor regardless.
    const hashedPassword = await hash(password, 12);

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      // Pad first, then schedule: nothing deferred may overlap the pad window.
      await padOpaqueResponse(startedAt);
      scheduleExistingAccountEmail(req.url, email, requestId);
      return acceptedResponse();
    }

    // The batch itself commits the complete account graph or rolls every
    // account row back.
    const user = await persistRegistration({ name, email, hashedPassword, role });

    // Registration creates an unverified account. The account remains usable
    // for a later resend even if the mail provider is temporarily unavailable.
    logger.info({ userId: user.id, role }, "User registered");

    await padOpaqueResponse(startedAt);
    scheduleNewAccountEmail(req.url, user, requestId);
    return acceptedResponse();
  } catch (error) {
    // The preflight read is only an ergonomic fast path. A second request can
    // still win between it and the batch; that race is an existing account
    // and must look exactly like one.
    if (isDuplicateEmailError(error) && submittedEmail) {
      await padOpaqueResponse(startedAt);
      scheduleExistingAccountEmail(req.url, submittedEmail, requestId);
      return acceptedResponse();
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error({ requestId, errorName: error instanceof Error ? error.name : "unknown" }, "Registration failed");
    return NextResponse.json(
      { error: "Đăng ký thất bại. Vui lòng thử lại sau." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
