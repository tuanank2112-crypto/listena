import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { requireAuthSecret } from "@/lib/auth-secret";
import { resolveMigrationWriteMode } from "@/lib/migration-write-gate";

const publicPaths = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function hasSegment(pathname: string, segment: string): boolean {
  return pathname === `/${segment}` || pathname.startsWith(`/${segment}/`);
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isAuthApiPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

function isPublicAccountActionApiPath(pathname: string): boolean {
  return pathname === "/api/register"
    || pathname === "/api/account/verification/request"
    || pathname === "/api/account/verification/confirm"
    || pathname === "/api/account/password-reset/request"
    || pathname === "/api/account/password-reset/confirm";
}

function authOrigin(req: NextRequest) {
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? req.url;
}

async function readToken(req: NextRequest) {
  return getToken({
    req,
    secret: requireAuthSecret(),
    secureCookie: new URL(authOrigin(req)).protocol === "https:",
  });
}

function isUnsafeWriteMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

const migrationWriteDisabledBody = {
  error: "Writes are temporarily disabled during migration.",
  code: "MIGRATION_WRITE_DISABLED",
} as const;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes did not previously pass through this proxy. Keep them out of
  // page-auth redirects while allowing the cutover fence to reject writes.
  if (isApiPath(pathname)) {
    if (
      resolveMigrationWriteMode() === "disabled" &&
      isUnsafeWriteMethod(req.method) &&
      !isAuthApiPath(pathname)
    ) {
      return NextResponse.json(migrationWriteDisabledBody, { status: 503 });
    }

    // Auth.js manages its own endpoints and the explicit public account-action
    // routes must remain reachable to a user holding a pre-verification cookie.
    // Every other API call rejects a session that lacks the signed verification
    // claim, including all JWTs issued before this contract was introduced.
    if (!isAuthApiPath(pathname) && !isPublicAccountActionApiPath(pathname)) {
      const token = await readToken(req);
      if (token && token.isEmailVerified !== true) {
        return NextResponse.json(
          { error: "Email verification is required.", code: "EMAIL_NOT_VERIFIED" },
          { status: 403 },
        );
      }
    }

    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Match Auth.js URL precedence, including HTTPS behind a reverse proxy.
  const token = await readToken(req);

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token.isEmailVerified !== true) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "email_not_verified");
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;

  // Teacher routes protection
  if (hasSegment(pathname, "teacher") && role !== "TEACHER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/learner/dashboard", req.url));
  }

  // Learner routes protection
  if (hasSegment(pathname, "learner") && role !== "LEARNER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/teacher/dashboard", req.url));
  }

  // Admin routes protection
  if (hasSegment(pathname, "admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Auth.js manages its own CSRF/session cookies. Excluding it from the
    // Proxy preserves its route semantics while every other API write remains
    // behind the migration fence.
    "/api/((?!auth(?:/|$)).*)",
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
