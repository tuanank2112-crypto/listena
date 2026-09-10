import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { resolveMigrationWriteMode } from "@/lib/migration-write-gate";

const publicPaths = [
  "/login",
  "/register",
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

    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Match Auth.js URL precedence, including HTTPS behind a reverse proxy.
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? req.url;
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    secureCookie: new URL(authUrl).protocol === "https:",
  });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
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
