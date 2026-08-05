import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runDailyScreen } from "@/lib/screen/run";

export const dynamic = "force-dynamic";
// A full screen fetches the universe under a rate-limit floor, so the run
// takes minutes rather than seconds.
export const maxDuration = 800;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST triggers the screen; it writes, costs hundreds of provider calls, and
// sends mail, so it is never exposed unauthenticated.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyScreen();
    return NextResponse.json(result, { status: result.alreadyRan ? 200 : 201 });
  } catch (err) {
    console.error("screen run failed:", err);
    return NextResponse.json(
      { error: "screen_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
