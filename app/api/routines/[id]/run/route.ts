import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getRoutineForUser,
  routineRunBudgetUsd,
  stampRoutineLaunched,
} from "@/lib/server/routines";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";

/**
 * “Launch now” (MIN-185): an OFF-SCHEDULE passage.
 *
 * Two things he doesn't do, and these are what define him:
 * - **it does not move `next_run_at`.** Trying your routine on a Tuesday should not
 * not blow up the following Monday; the calendar belongs to the cadence,
 *    not the button;
 * - **it does not change the invoice line.** It is the routine that works,
 * even triggered by hand: the expense remains under “Routines”.
 *
 * Owner alone, like any writing on a routine.
 */

export const runtime = "nodejs";
// The launch kick drains the first chunk into `after()`.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
  managedServiceUnavailable: 503,
  executionBackendUnavailable: 503,
  noModelForProvider: 400,
  localEndpointRequiresLocalRun: 409,
  modelAbovePlan: 403,
  promptRequired: 400,
};

function launchErrorResponse(result: Extract<LaunchResult, { ok: false }>) {
  return NextResponse.json(
    {
      error: result.error,
      code: result.error,
      run: result.run,
      quota: result.quota,
      modelLimit: result.modelLimit,
    },
    { status: LAUNCH_ERROR_STATUS[result.error] ?? 400 },
  );
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const found = await getRoutineForUser(id, auth.user.id);
  if (!found) return NextResponse.json({ error: "routineNotFound" }, { status: 404 });
  if (!found.isOwner) {
    return NextResponse.json({ error: "ownerOnly", code: "ownerOnly" }, { status: 403 });
  }

  const routine = found.routine;
  const result = await launchAgentRun({
    projectId: routine.project_id,
    userId: routine.owner_id,
    triggeredBy: "routine",
    prompt: routine.prompt,
    promptMentions: routine.prompt_mentions,
    title: routine.title,
    ...(routine.model ? { model: routine.model, forced: true } : {}),
    reasoningLevel: routine.reasoning_level,
    baseBranch: routine.base_branch,
    routineId: routine.id,
    // The same ceiling as a passage in the calendar: it is the routine which
    // works, and trying yours should not cost more than the
    // run on its own.
    budgetUsd: await routineRunBudgetUsd(routine),
  });
  if (!result.ok) return launchErrorResponse(result);
  // The passage is gone: the routine remembers that it has turned (and the alert of the
  // previous passage goes out), without its calendar moving an inch.
  await stampRoutineLaunched(routine.id);
  return NextResponse.json({ run: result.run });
}
