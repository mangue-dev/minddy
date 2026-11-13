import { after, NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getRoutineForUser,
  stampRoutineLaunched,
} from "@/lib/server/routines";
import {
  numoIntentErrorResponse,
} from "@/lib/server/numo/start-intent";
import { executeNumoTurn } from "@/lib/server/numo/turns";
import { startRoutineOccurrence } from "@/lib/server/routine-occurrences";
import { aiConsentRefusal } from "@/lib/server/ai-consent";

/**
 * Start one off-schedule occurrence through the same durable Numo entry used
 * by cron. It records manual origin and execution history but deliberately
 * leaves `next_run_at` unchanged. Only the routine owner may invoke it.
 */

export const runtime = "nodejs";
// The initial Numo turn may execute tools before yielding to durable work.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  // The mobile app asks before any AI work (MIN-907, guideline 5.1.2(i)).
  const consentRefusal = await aiConsentRefusal();
  if (consentRefusal) return consentRefusal;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const found = await getRoutineForUser(id, auth.user.id);
  if (!found) return NextResponse.json({ error: "routineNotFound" }, { status: 404 });
  if (!found.isOwner) {
    return NextResponse.json({ error: "ownerOnly", code: "ownerOnly" }, { status: 403 });
  }

  const routine = found.routine;
  let started;
  try {
    started = await startRoutineOccurrence({
      routine,
      origin: "manual",
      readClient: auth.supabase,
    });
  } catch (error) {
    return numoIntentErrorResponse(error);
  }
  // Record activity and clear the previous alert without moving the schedule.
  await stampRoutineLaunched(routine.id);
  after(async () => {
    try {
      await executeNumoTurn({
        turnId: started.turn.id,
        readClient: auth.supabase,
      });
    } catch (error) {
      console.error("[routines] manual Numo occurrence failed:", error);
    }
  });
  return NextResponse.json({ occurrence: started.occurrence }, { status: 202 });
}
