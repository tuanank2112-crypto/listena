import { NextResponse } from "next/server";

/**
 * Role gate for learner-owned APIs (Plan13 P130 §6).
 *
 * Kept free of Prisma and Auth.js imports so `src/proxy.ts` can share the
 * same prefix list and decision without pulling server-only modules into
 * the request boundary.
 */

export type AppRole = "LEARNER" | "TEACHER" | "ADMIN";

/** API prefixes that write or read a learner's own study data. */
export const LEARNER_API_PREFIXES = [
  "/api/attempt",
  "/api/flashcard",
  "/api/learning-sessions",
  "/api/game-runs",
  "/api/game-session",
  "/api/tutor",
  "/api/learner",
  "/api/recommendation",
] as const;

export const ROLE_FORBIDDEN = "ROLE_FORBIDDEN" as const;

export function isLearnerApiPath(pathname: string): boolean {
  return LEARNER_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** LEARNER and ADMIN may use learner APIs; TEACHER may not. */
export function canUseLearnerApi(role: string | undefined | null): boolean {
  return role === "LEARNER" || role === "ADMIN";
}

export function roleForbiddenResponse() {
  return NextResponse.json(
    { code: ROLE_FORBIDDEN, error: "Vai trò này không dùng được chức năng học viên." },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * Route-level companion to the proxy gate. Returns a 403 response for a
 * TEACHER session, or `null` when the caller may proceed. Callers must still
 * handle the unauthenticated case themselves (401).
 */
export function requireLearnerRole(
  session: { user?: { role?: string | null } | null } | null | undefined,
): NextResponse | null {
  const role = session?.user?.role;
  if (!role) return null;
  return canUseLearnerApi(role) ? null : roleForbiddenResponse();
}
