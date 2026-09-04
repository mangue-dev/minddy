import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  claimRoutine,
  dueRoutines,
  routineRunBudgetUsd,
  stampRoutineError,
  type Routine,
  type RoutineErrorCode,
} from "@/lib/server/routines";
import { launchAgentRun } from "@/lib/server/agent/launch";

/**
 * THE Routines CLOCK (MIN-185): every five minutes, the routines including
 * the deadline has passed, leave.
 *
 * **A dedicated cron**, separate from `agent-drain` (whose 800 s window is used for
 * work itself) and `automations`: launching a run is short, and five
 * minutes are enough for the granularity of “9 a.m.”. Same cadence as `smart-assign`.
 *
 * **In SERIES**, never in parallel: each turn creates a run, and the `after()` of
 * launch drains its first chunk in the same invocation. Ten routines
 * launched at once would step on each other on the same function.
 *
 * **A missed passage is never made up.** The deadline is brought forward BEFORE the
 * launch (`claimRoutine`, compare-and-set) and remains advanced even if the
 * launch fails: a daily routine left without a budget for three days
 * leaves tomorrow, she doesn't play three times. What we lose is a passage;
 * what we would narrowly avoid is a burst of three profitable runs on a
 * budget already dry.
 *
 * **A failure SAY**: `last_error` carries a CODE (never a sentence — it is
 * the UI that translates), read in the routine header. The exhausted budget is visible
 * so to the place where we go to look for why nothing happened.
 *
 * **Each passage leaves with a SPENDING CAP** (`routineRunBudgetUsd`),
 * a part of the monthly budget settled on routine. There was none: the
 * quota of the account was limited alone, so a passage could legitimately take
 * 100% of the month — and on a $5 usage plan, leave nothing at work
 * by hand. It is not a refusal to throw: the passage leaves, and it is the
 * loop that stops at the border, extensive work and guarded checkpoint.
 */

export const runtime = "nodejs";
// The launch kick drains the first chunk into `after()`, like the route to
// launch notebook: same window.
export const maxDuration = 300;

/** Routines processed by alarm clock. Beyond that, the next awakening (5 min) takes place. */
const MAX_PER_TICK = 10;

/** Translates a launch refusal into a `last_error` code. */
function launchErrorCode(error: string): RoutineErrorCode {
  switch (error) {
    case "quotaExceeded":
      return "quota";
    case "managedServiceUnavailable":
      return "managedServiceUnavailable";
    case "executionBackendUnavailable":
      return "executionBackendUnavailable";
    case "noRepo":
    case "unsupportedProvider":
      return "noRepo";
    case "alreadyRunning":
      return "alreadyRunning";
    case "modelAbovePlan":
      return "modelAbovePlan";
    default:
      return "launchFailed";
  }
}

async function runRoutine(routine: Routine): Promise<{ id: string; outcome: string }> {
  // The deadline first: it is worth a reservation. Lose the race (a second
  // concurrent wake-up has already passed) means not launching anything at all.
  const claim = await claimRoutine(routine);
  if (!claim.claimed) return { id: routine.id, outcome: "raced" };

  const result = await launchAgentRun({
    projectId: routine.project_id,
    // Technical actor: the owner of the routine. Its key, its quota, its language.
    userId: routine.owner_id,
    triggeredBy: "routine",
    prompt: routine.prompt,
    promptMentions: routine.prompt_mentions,
    // The title is that of the routine, written ONCE at its creation: no
    // summary to be paid for each visit (see `launch.ts`).
    title: routine.title,
    ...(routine.model ? { model: routine.model, forced: true } : {}),
    reasoningLevel: routine.reasoning_level,
    baseBranch: routine.base_branch,
    routineId: routine.id,
    // The ceiling of THIS passage (see `routineRunBudgetUsd`): the loop takes the
    // tighter between it and the account quota. It is he who prevents
    // passage to take the whole month.
    budgetUsd: await routineRunBudgetUsd(routine),
  });

  if (!result.ok) {
    await stampRoutineError(routine.id, launchErrorCode(result.error));
    return { id: routine.id, outcome: result.error };
  }
  // The passage is gone: the alert of the previous passage is no longer relevant.
  await stampRoutineError(routine.id, null);
  return { id: routine.id, outcome: "launched" };
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
