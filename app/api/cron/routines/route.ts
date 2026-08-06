import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  claimRoutine,
  dueRoutines,
  stampRoutineError,
  type Routine,
  type RoutineErrorCode,
} from "@/lib/server/routines";
import { launchAgentRun } from "@/lib/server/agent/launch";

/**
 * L'HORLOGE des routines (MIN-185) : toutes les cinq minutes, les routines dont
 * l'échéance est passée partent.
 *
 * **Un cron dédié**, séparé d'`agent-drain` (dont la fenêtre de 800 s sert au
 * travail lui-même) et d'`automations` : lancer un run est court, et cinq
 * minutes suffisent à la granularité de « 9 h ». Même cadence que `smart-assign`.
 *
 * **En SÉRIE**, jamais en parallèle : chaque tour crée un run, et l'`after()` du
 * lancement draine son premier chunk dans la même invocation. Dix routines
 * lancées d'un coup se marcheraient dessus sur la même fonction.
 *
 * **Un passage manqué n'est jamais rattrapé.** L'échéance est avancée AVANT le
 * lancement (`claimRoutine`, compare-and-set) et reste avancée même si le
 * lancement échoue : une routine quotidienne restée trois jours sans budget
 * repart demain, elle ne joue pas trois fois. Ce qu'on perd, c'est un passage ;
 * ce qu'on éviterait de justesse, c'est une rafale de trois runs payants sur un
 * budget déjà à sec.
 *
 * **Un échec se DIT** : `last_error` porte un CODE (jamais une phrase — c'est
 * l'UI qui traduit), lu dans l'en-tête de la routine. C'est ce qui rend tenable
 * l'absence de garde-fou de dépense propre aux routines : le budget épuisé se
 * voit à l'endroit où on va chercher pourquoi rien ne s'est passé.
 */

export const runtime = "nodejs";
// Le kick du lancement draine le premier chunk dans `after()`, comme la route de
// lancement carnet : même fenêtre.
export const maxDuration = 300;

/** Routines traitées par réveil. Au-delà, le réveil suivant (5 min) prend la suite. */
const MAX_PER_TICK = 10;

/** Traduit un refus de lancement en code de `last_error`. */
function launchErrorCode(error: string): RoutineErrorCode {
  switch (error) {
    case "quotaExceeded":
      return "quota";
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
  // L'échéance d'abord : elle vaut réservation. Perdre la course (un second
  // réveil concurrent est déjà passé) veut dire ne rien lancer du tout.
  const claim = await claimRoutine(routine);
  if (!claim.claimed) return { id: routine.id, outcome: "raced" };

  const result = await launchAgentRun({
    projectId: routine.project_id,
    // Acteur technique : le owner de la routine. Sa clé, son quota, sa langue.
    userId: routine.owner_id,
    triggeredBy: "routine",
    prompt: routine.prompt,
    // Le titre est celui de la routine, écrit UNE fois à sa création : pas de
    // résumé à repayer à chaque passage (cf. `launch.ts`).
    title: routine.title,
    ...(routine.model ? { model: routine.model, forced: true } : {}),
    reasoningLevel: routine.reasoning_level,
    baseBranch: routine.base_branch,
    routineId: routine.id,
  });

  if (!result.ok) {
    await stampRoutineError(routine.id, launchErrorCode(result.error));
    return { id: routine.id, outcome: result.error };
  }
  // Le passage est parti : l'alerte du passage précédent n'a plus lieu d'être.
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
      // Une routine qui lève ne doit pas emporter les suivantes.
      console.error(`[cron/routines] ${routine.id} threw:`, (err as Error).message);
      await stampRoutineError(routine.id, "launchFailed").catch(() => {});
      results.push({ id: routine.id, outcome: "threw" });
    }
  }
  return NextResponse.json({ ok: true, due: due.length, results });
}

export const GET = handle;
export const POST = handle;
