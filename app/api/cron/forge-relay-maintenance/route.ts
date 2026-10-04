import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { pruneFinishedRelayDeliveries } from "@/lib/server/forge-relay/fanout";

/** Hourly retention cleanup, separate from time-sensitive webhook delivery. */
export const runtime = "nodejs";

async function run(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pruned = await pruneFinishedRelayDeliveries();
  return NextResponse.json({ pruned });
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
