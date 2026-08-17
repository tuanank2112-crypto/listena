import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPaths = [
  "/login",
  "/register",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;

  // Teacher routes protection
  if (pathname.startsWith("/teacher") && role !== "TEACHER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/learner", req.url));
  }

  // Learner routes protection
  if (pathname.startsWith("/learner") && role !== "LEARNER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/teacher", req.url));
  }

  // Admin routes protection
  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
