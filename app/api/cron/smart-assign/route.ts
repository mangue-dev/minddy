import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { sweepUnassignedIssues } from "@/lib/server/smart-assign";

/**
 * The Smart Assign NET (MIN-31): tickets that should have been triggered
 * assign and who remained without anyone.
 *
 * It exists because a ticket created by the MCP proved it: the assignment lived
 * in a `after()`, the `after()` did not go to the end, and nothing was left
 * — neither assigned, nor error, nor retry. The written deterministic case
 * now before the answer and no longer depends on anything; the call to the model, he,
 * remains deferred, therefore loseable. It is this remainder that this awakening catches up with.
 *
 * Short by construction: the scan is limited (24 h, never assigned, 100
 * tickets), and the vast majority of wake-ups find nothing.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sweepUnassignedIssues();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
