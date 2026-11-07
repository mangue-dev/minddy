import { processRoutineEvents } from "@/lib/server/routine-event-processing";

import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  claimRoutine,
  dueRoutines,
  stampRoutineError,
  type Routine,
  type RoutineErrorCode,
} from "@/lib/server/routines";
import { startRoutineOccurrence } from "@/lib/server/routine-occurrences";
import { executeNumoTurn } from "@/lib/server/numo/turns";
import { notifyRoutineLaunchFailure } from "@/lib/server/routine-hooks";
import { getServiceClient } from "@/lib/supabase-service";
import { drainNumoEventBatches } from "@/lib/server/numo/event-batches";

/**
 * The routines clock (MIN-185). Every five minutes it claims due schedules,
 * reserves one durable Numo conversation per due timestamp, and starts the
 * first turn in series so concurrent work cannot overwhelm one invocation.
 *
 * `claimRoutine` advances the schedule before admission. A missed occurrence
 * is recorded but never replayed in a burst, preserving the existing cadence
 * and DST behavior. The occurrence's turn carries its configured spend cap.
 */

export const runtime = "nodejs";
// The initial Numo turn may execute tools before the response.
export const maxDuration = 300;

/** The next five-minute tick handles anything beyond this batch. */
const MAX_PER_TICK = 10;
/** Journal rows read per tick; each costs a few queries and no model call. */
const MAX_EVENTS_PER_TICK = 200;
/** Due Numo event batches handed out per tick (MIN-926). */
const MAX_BATCHES_PER_TICK = 20;
/**
 * The journal stops being read after this, so a backlog cannot crowd out the
 * schedules that follow; a killed tick would also strand its leased rows.
 */
const EVENT_BUDGET_MS = 120_000;

/** Translates a launch refusal into a `last_error` code. */
function launchErrorCode(error: string): RoutineErrorCode {
  switch (error) {
    case "quotaExceeded":
    case "usage_budget_exceeded":
      return "quota";
    case "managedServiceUnavailable":
      return "managedServiceUnavailable";
    default:
      return "launchFailed";
  }
}

async function runRoutine(routine: Routine): Promise<{ id: string; outcome: string }> {
  // Claim the exact due timestamp before creating its idempotent occurrence.
  const scheduledFor = routine.next_run_at;
  const claim = await claimRoutine(routine);
  if (!claim.claimed) return { id: routine.id, outcome: "raced" };

  try {
    const started = await startRoutineOccurrence({
      routine,
      origin: "scheduled",
      scheduledFor,
    });
    await stampRoutineError(routine.id, null);
    const result = await executeNumoTurn({
      turnId: started.turn.id,
      readClient: getServiceClient(),
    });
    return { id: routine.id, outcome: result.status };
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : (error as Error).message;
    await stampRoutineError(routine.id, launchErrorCode(code));
    // Only the first failure in a row: the next ticks keep retrying.
    if (!routine.last_error) notifyRoutineLaunchFailure(routine);
    return { id: routine.id, outcome: code };
  }
}

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const eventWork = await processRoutineEvents(MAX_PER_TICK, {
    eventLimit: MAX_EVENTS_PER_TICK,
    deadline: Date.now() + EVENT_BUDGET_MS,
  });
  const due = await dueRoutines(MAX_PER_TICK);
  const results: Array<{ id: string; outcome: string }> = [];
  for (const routine of due) {
    try {
      results.push(await runRoutine(routine));
    } catch (err) {
      // A routine that lifts should not overwhelm the following ones.
      console.error(`[cron/routines] ${routine.id} threw:`, (err as Error).message);
      await stampRoutineError(routine.id, "launchFailed").catch(() => {});
      results.push({ id: routine.id, outcome: "threw" });
    }
  }
  // Last: a batch is minutes old by design and can wait for the schedules.
  // Routing ran above, so a batch that fell due during this tick goes out now.
  const batchWork = await drainNumoEventBatches(MAX_BATCHES_PER_TICK).catch((error: Error) => {
    console.error("[cron/routines] numo batches:", error.message);
    return { claimed: 0, outcomes: [] };
  });
  return NextResponse.json({ ok: true, due: due.length, results, eventWork, batchWork: { claimed: batchWork.claimed } });
}

export const GET = handle;
export const POST = handle;
