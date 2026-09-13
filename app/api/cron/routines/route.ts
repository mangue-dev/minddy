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
import { getServiceClient } from "@/lib/supabase-service";

/**
 * The routines clock (MIN-185). Every five minutes it claims due schedules,
 * reserves one durable Numo conversation per due timestamp, and starts the
 * first turn in series so concurrent work cannot overwhelm one invocation.
 *
 * `claimRoutine` advances the schedule before admission. A missed occurrence
 * is recorded but never replayed in a burst, preserving the existing cadence
 * and DST behavior. The occurrence's parent turn shares its configured spend
 * cap with every delegated worker.
 */

export const runtime = "nodejs";
// The initial Numo turn may execute tools before yielding to durable work.
export const maxDuration = 300;

/** The next five-minute tick handles anything beyond this batch. */
const MAX_PER_TICK = 10;

/** Translates a launch refusal into a `last_error` code. */
function launchErrorCode(error: string): RoutineErrorCode {
  switch (error) {
    case "quotaExceeded":
    case "usage_budget_exceeded":
      return "quota";
    case "managedServiceUnavailable":
      return "managedServiceUnavailable";
    case "executionBackendUnavailable":
      return "executionBackendUnavailable";
    case "providerEndpointUnavailableFromSandbox":
      return "providerEndpointUnavailableFromSandbox";
    case "noRepo":
    case "unsupportedProvider":
      return "noRepo";
    case "alreadyRunning":
      return "alreadyRunning";
    case "noModelForProvider":
      return "noModelForProvider";
    case "modelAbovePlan":
      return "modelAbovePlan";
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
    return { id: routine.id, outcome: code };
  }
}

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
  return NextResponse.json({ ok: true, due: due.length, results });
}

export const GET = handle;
export const POST = handle;
