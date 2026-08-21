import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";

import {
  pruneFinishedRelayDeliveries,
  processDueRelayDeliveries,
} from "@/lib/server/forge-relay/fanout";
import { pruneStaleRelayClaims } from "@/lib/server/forge-relay/claims";

/**
 * Forge-relay delivery worker: fans out due webhook deliveries to their
 * instances (at-least-once, retry with backoff, dead-letter after
 * exhaustion) and prunes finished rows and stale claim rows past their
 * retention windows. Authenticated like every cron route; Vercel Cron sends
 * the `Authorization: Bearer ${CRON_SECRET}` header.
 */
export const runtime = "nodejs";

async function run(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const outcome = await processDueRelayDeliveries();
  const pruned = await pruneFinishedRelayDeliveries();
  await pruneStaleRelayClaims();
  return NextResponse.json({ ...outcome, pruned });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
