import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { runDueSmartFillReevaluations } from "@/lib/server/smart-fill-reevaluation";
import { runAsBackgroundAiWork } from "@/lib/server/ai-consent";

/**
 * Smart Fill re-evaluation (MIN-750): runs the passes whose title and
 * description have rested for five minutes. Every minute, so the delay a
 * person sees stays close to those five minutes; most ticks find nothing due.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // AI runs under each account's answer in the mobile app (MIN-907).
  const result = await runAsBackgroundAiWork(() => runDueSmartFillReevaluations());
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
