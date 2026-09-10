import { NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { getDatabaseRuntime, prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Configuration alone is not a readiness check. A bounded, non-sensitive
    // query proves that the configured libSQL endpoint can serve requests.
    await prisma.user.count({ take: 1 });
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      databaseRuntime: getDatabaseRuntime(),
    });
  } catch (error) {
    return databaseErrorResponse(error)
      ?? NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
