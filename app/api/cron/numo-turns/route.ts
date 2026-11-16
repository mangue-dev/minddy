import { NextResponse, type NextRequest } from "next/server";
import { afterOrNow } from "@/lib/server/after-safe";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { drainNumoTurns, runHandedOffNumoTurn } from "@/lib/server/numo/turns";
import { numoJobDeadline } from "@/lib/server/numo/job-deadline";
import { drainNumoWakeTurns } from "@/lib/server/numo/wake";
import { drainNumoWatchTurns } from "@/lib/server/numo/watch-clock";
import { runAsBackgroundAiWork } from "@/lib/server/ai-consent";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: NextRequest) {
  const deadlineAt = numoJobDeadline();
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // A turn that ran out of time in its job asks for a new one here
  // (MIN-1010). The answer goes back at once so the previous job can end;
  // this invocation keeps running the turn after it.
  const handedOff = request.nextUrl.searchParams.get("turn");
  if (handedOff !== null) {
    if (!UUID.test(handedOff)) {
      return NextResponse.json({ error: "invalid turn" }, { status: 400 });
    }
    afterOrNow(async () => {
      try {
        await runHandedOffNumoTurn(handedOff, { deadlineAt });
      } catch (error) {
        console.error("[cron/numo-turns] handed-off turn:", (error as Error).name);
      }
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  // Background wakes (MIN-929) run here, a few at a time and side by side,
  // with the invocation to themselves; the routines clock only admits them.
  // Reminder turns (MIN-923) have a lane of their own too: each keeps the
  // user's conversation busy until it runs.
  const [summary, wakes, reminders] = await Promise.all([
    drainNumoTurns({ limit: 1, deadlineAt }),
    // Wakes and reminders are Numo acting on its own: they follow each
    // account's answer in the mobile app (MIN-907). Admitted turns already
    // passed that check when their request came in.
    runAsBackgroundAiWork(() => drainNumoWakeTurns()).catch((error: Error) => {
      console.error("[cron/numo-turns] wakes:", error.name);
      return { ran: 0 };
    }),
    runAsBackgroundAiWork(() => drainNumoWatchTurns()).catch((error: Error) => {
      console.error("[cron/numo-turns] reminders:", error.name);
      return { ran: 0 };
    }),
  ]);
  return NextResponse.json({ ok: true, claimed: summary.claimed, wakes: wakes.ran, reminders: reminders.ran });
}

export const GET = handle;
export const POST = handle;
