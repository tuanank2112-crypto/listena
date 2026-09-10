import { NextResponse } from "next/server";
import { getDatabaseRuntime } from "@/lib/prisma";

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString(), databaseRuntime: getDatabaseRuntime() });
}
