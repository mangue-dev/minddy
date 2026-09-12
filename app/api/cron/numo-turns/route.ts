import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { drainNumoTurns } from "@/lib/server/numo/turns";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await drainNumoTurns({ limit: 1 });
  return NextResponse.json({ ok: true, claimed: summary.claimed });
}

export const GET = handle;
export const POST = handle;
