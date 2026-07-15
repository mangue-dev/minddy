import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  getRun,
  insertRunMessage,
  stampRun,
  bumpRunActivity,
  type AgentRunStatus,
} from "@/lib/server/agent/runs";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Steering d'un run d'agent de code (MIN-46) : l'utilisateur envoie un message. La
 * session ne se ferme JAMAIS → on accepte tout run REPRENNABLE (tout sauf `failed`),
 * y compris un run `completed` après une PR : on le relance pour itérer sur la MÊME
 * branche/PR. Le message rejoint la file `agent_run_messages` ; la boucle le draine à
 * la frontière de round et l'injecte comme message `user`. Cas :
 *   • running / queued          → orientation à chaud (drainé au round suivant) ;
 *   • needs_input / completed /
 *     canceled                  → nouveau tour : on repasse le run `queued`, budget
 *                                 de tour réinitialisé, et on kicke le drain.
 * Membre du projet requis. Un seul écrivain d'events = le claimer.
 */

type RouteContext = { params: Promise<{ runId: string }> };

/** Reprennable = tout sauf `failed` (erreur d'amorçage repo/modèle). */
const RESUMABLE: AgentRunStatus[] = ["queued", "running", "needs_input", "completed", "canceled"];
/** Statuts au repos/terminés qui exigent une relance (re-queue + kick). */
const RESUME_FROM: AgentRunStatus[] = ["needs_input", "completed", "canceled"];
const MAX_LEN = 4000;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let payload: { message?: string };
  try {
    payload = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = (typeof payload.message === "string" ? payload.message : "").trim().slice(0, MAX_LEN);
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!RESUMABLE.includes(run.status)) {
    return NextResponse.json({ error: "Run is not resumable" }, { status: 409 });
  }

  await insertRunMessage(runId, auth.user.id, message);
  // Un message relance l'horloge d'inactivité (empêche le reaping imminent).
  await bumpRunActivity(runId);

  // Reprise d'un run au repos OU terminé (après PR) : nouveau tour sur la même
  // branche/PR (window de tour réinitialisée → claim ré-ancre le wall-clock).
  if (RESUME_FROM.includes(run.status)) {
    const resumed = await stampRun(
      runId,
      { status: "queued", not_before: new Date().toISOString(), window_started_at: null },
      { guard: RESUME_FROM },
    );
    if (resumed) kickAgentDrain(getServiceClient());
  }

  return NextResponse.json({ ok: true, status: run.status });
}
