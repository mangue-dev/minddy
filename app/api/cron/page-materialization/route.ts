import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { materializeStalePages } from "@/lib/server/pages";
import { materializeStaleDescriptions } from "@/lib/server/description-collaboration";

/**
 * The safety net of live page collaboration (MIN-688): typing batches are
 * only journaled, and the request that accepted them schedules writing them
 * into the page row a few seconds later. When that never runs (the instance
 * stopped first), this job materializes every page whose pending steps are
 * older than fifteen seconds, fifty pages per run. Live issue and objective
 * descriptions (MIN-728) get the same net: their Markdown is written from the
 * document when no request did it.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [pages, descriptions] = await Promise.all([
      materializeStalePages(),
      materializeStaleDescriptions(),
    ]);
    return NextResponse.json({ ok: true, ...pages, ...descriptions });
  } catch {
    console.error("[page-materialization] run failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
