import { NextResponse, type NextRequest } from "next/server";

import { runAsBackgroundAiWork } from "@/lib/server/ai-consent";
import { runAiInstructionProposals } from "@/lib/server/ai-instruction-proposals";
import { verifyCronSecret } from "@/lib/server/cron-auth";

/**
 * Instructions proposed from corrections (MIN-988), once a week. The run
 * first counts, without AI, the values of Smart Fill and Smart Assign that
 * people changed by hand; only a project past the threshold costs one short
 * call, and most weeks there is none.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // AI runs under each account's answer in the mobile app (MIN-907).
    const result = await runAsBackgroundAiWork(() => runAiInstructionProposals());
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error("[cron/ai-instruction-proposals] run failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
