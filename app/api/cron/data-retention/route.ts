import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { runRetentionSweep } from "@/lib/server/retention";

/**
 * Nightly Cron (Vercel Cron, vercel.json): applies retention periods
 * announced by the confidentiality policy (MIN-119, GDPR art. 5.1.e).
 *
 * Scheduled at 3:45 UTC, away from other crons: scan reads and writes
 * on hot tables (notifications, agent events) and has no
 * reason to do it while someone is working.
 *
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}`; the road is
 * unusable without. One failed step does not cancel the others: the answer
 * carries the detail by step, and `ok: false` indicates that you have to go and see.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runRetentionSweep();
  return NextResponse.json(result);
}
