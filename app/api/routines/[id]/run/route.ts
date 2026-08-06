import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getRoutineForUser, stampRoutineLaunched } from "@/lib/server/routines";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";

/**
 * « Lancer maintenant » (MIN-185) : un passage HORS CALENDRIER.
 *
 * Deux choses qu'il ne fait pas, et ce sont elles qui le définissent :
 *  - **il ne déplace pas `next_run_at`.** Essayer sa routine un mardi ne doit
 *    pas faire sauter le lundi suivant ; le calendrier appartient à la cadence,
 *    pas au bouton ;
 *  - **il ne change pas de ligne de facture.** C'est la routine qui travaille,
 *    même déclenchée à la main : la dépense reste sous « Routines ».
 *
 * Propriétaire seul, comme toute écriture sur une routine.
 */

export const runtime = "nodejs";
// Le kick du lancement draine le premier chunk dans `after()`.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
  noModelForProvider: 400,
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
    title: routine.title,
    ...(routine.model ? { model: routine.model, forced: true } : {}),
    reasoningLevel: routine.reasoning_level,
    baseBranch: routine.base_branch,
    routineId: routine.id,
  });
  if (!result.ok) return launchErrorResponse(result);
  // Le passage est parti : la routine retient qu'elle a tourné (et l'alerte du
  // passage précédent s'éteint), sans que son calendrier bouge d'un pouce.
  await stampRoutineLaunched(routine.id);
  return NextResponse.json({ run: result.run });
}
