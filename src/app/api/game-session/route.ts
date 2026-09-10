import { NextResponse } from "next/server";

/**
 * Retired in Plan06. The previous endpoint accepted a browser-supplied
 * `correct` Boolean and therefore could manufacture mastery evidence. It is
 * deliberately terminal rather than translated into a server score because a
 * legacy payload lacks the private run/round validator required to grade it.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "GAME_SESSION_RETIRED",
      message: "Hãy bắt đầu một lượt game mới để được chấm bởi máy chủ.",
    },
    { status: 410 },
  );
}
