import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { getLearnerTimeline } from "@/server/learning/timeline";
import logger from "@/lib/logger";

function parseWindow(value: string | null): 7 | 30 | null {
  if (value === null || value === "7d") return 7;
  if (value === "30d") return 30;
  return null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const windowDays = parseWindow(new URL(request.url).searchParams.get("window"));
  if (windowDays === null) {
    return NextResponse.json({ error: "Invalid timeline window" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getLearnerTimeline(session.user.id, windowDays));
  } catch (error) {
    logger.error({ error }, "Failed to load learner timeline");
    return NextResponse.json({ error: "Chưa tải được hoạt động học" }, { status: 500 });
  }
}
