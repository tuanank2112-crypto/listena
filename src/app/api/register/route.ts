import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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
import { isEmailDeliveryUnavailableError } from "@/server/email";
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

export async function POST(req: Request) {
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
    // Public registration never grants a privileged authoring role. Teachers
    // are provisioned through an authenticated administrative workflow.
    const role = "LEARNER" as const;

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email đã được sử dụng" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Hash before entering the write batch. The batch itself commits the
    // complete account graph or rolls every account row back.
    const hashedPassword = await hash(password, 12);
    const user = await persistRegistration({
      name,
      email,
      hashedPassword,
      role,
    });

    // Registration creates an unverified account. The account remains usable
    // for a later resend even if the mail provider is temporarily unavailable.
    let verificationEmailSent = false;
    try {
      const token = await issueAccountActionToken({
        userId: user.id,
        purpose: "VERIFY_EMAIL",
      });
      if (token) {
        await sendVerificationEmail({
          requestUrl: req.url,
          recipient: user,
          rawToken: token.rawToken,
        });
        verificationEmailSent = true;
      }
    } catch (error) {
      logger.warn(
        {
          userId: user.id,
          reason: isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown",
        },
        "Initial verification email delivery unavailable",
      );
    }

    logger.info({ userId: user.id, role }, "User registered");

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        verificationEmailSent,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // The preflight read is only an ergonomic fast path. A second request can
    // still win between it and the batch, so map that exact unique race to the
    // documented conflict response rather than exposing a server error.
    if (isDuplicateEmailError(error)) {
      return NextResponse.json(
        { error: "Email đã được sử dụng" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error({ err: error }, "Registration failed");
    return NextResponse.json(
      { error: "Đăng ký thất bại. Vui lòng thử lại sau." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
