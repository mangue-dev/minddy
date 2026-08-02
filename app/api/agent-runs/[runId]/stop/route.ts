import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, requestInterrupt } from "@/lib/server/agent/runs";
import { stopChainOnInterrupt } from "@/lib/server/automations/hooks";

/**
 * « Interrompre la réponse en cours » d'une session d'agent (MIN-46). Pose le
 * drapeau d'interruption : le chunk qui tourne abandonne l'appel LLM en cours (à la
 * frontière de round ou en plein stream) et revient AU REPOS. N'ANNULE PAS la
 * session, ne touche ni au checkpoint ni à la sandbox — tout reste reprennable.
 * (L'endpoint reste /stop côté client.) Membre du projet requis.
 */

type RouteContext = { params: Promise<{ runId: string }> };

const WORKING = ["queued", "running"];

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  // On n'interrompt qu'un run qui TRAVAILLE ; au repos il n'y a rien à interrompre.
  if (WORKING.includes(run.status)) {
    await requestInterrupt(runId);
  }

  // Un « stop » humain ARRÊTE la chaîne (MIN-147), il ne la fait pas avancer :
  // c'est le geste de quelqu'un qui veut que ça cesse, pas une fin d'étape. Il
  // faut le dire ICI — le crochet de fin de run ne peut pas le déduire,
  // `clearInterrupt` ayant déjà effacé le drapeau quand `stampRun` s'exécute.
  if (run.chain_id) stopChainOnInterrupt(run.chain_id);

  return NextResponse.json({ ok: true, status: run.status });
}
