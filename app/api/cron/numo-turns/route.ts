import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { drainNumoTurns } from "@/lib/server/numo/turns";
import { drainNumoWakeTurns } from "@/lib/server/numo/wake";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Background wakes (MIN-929) run here, a few at a time and side by side,
  // with the invocation to themselves; the routines clock only admits them.
  const [summary, wakes] = await Promise.all([
    drainNumoTurns({ limit: 1 }),
    drainNumoWakeTurns().catch((error: Error) => {
      console.error("[cron/numo-turns] wakes:", error.name);
      return { ran: 0 };
    }),
  ]);
  return NextResponse.json({ ok: true, claimed: summary.claimed, wakes: wakes.ran });
}

export const GET = handle;
export const POST = handle;
