import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { drainNumoTurns } from "@/lib/server/numo/turns";
import { drainNumoWakeTurns } from "@/lib/server/numo/wake";
import { drainNumoWatchTurns } from "@/lib/server/numo/watch-clock";
import { runAsBackgroundAiWork } from "@/lib/server/ai-consent";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Background wakes (MIN-929) run here, a few at a time and side by side,
  // with the invocation to themselves; the routines clock only admits them.
  // Reminder turns (MIN-923) have a lane of their own too: each keeps the
  // user's conversation busy until it runs.
  const [summary, wakes, reminders] = await Promise.all([
    drainNumoTurns({ limit: 1 }),
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
