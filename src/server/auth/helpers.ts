import { auth } from "./config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";

export async function getSession() {
  return auth();
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export function requireRole(...roles: Role[]) {
  return async () => {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!roles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  };
}

export function isTeacher(role: string): boolean {
  return role === "TEACHER" || role === "ADMIN";
}

export function isAdmin(role: string): boolean {
  return role === "ADMIN";
}
