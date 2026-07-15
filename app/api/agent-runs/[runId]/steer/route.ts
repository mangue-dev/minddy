import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, insertRunMessage, stampRun, bumpRunActivity } from "@/lib/server/agent/runs";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Steering d'un run d'agent de code (MIN-46) : l'utilisateur envoie un message à
 * un run ACTIF, sans l'annuler. Le message rejoint la file `agent_run_messages` ;
 * la boucle le draine à la frontière de round et l'injecte comme message `user`.
 * Deux cas :
 *   • running / queued  → orientation à chaud (la boucle le prend au round suivant) ;
 *   • needs_input       → réponse à un `ask_user` : on repasse le run `queued` et on
 *                         kicke le drain (reprise immédiate).
 * Membre du projet requis. Le live view affiche le message quand la boucle le draine
 * (un seul écrivain d'events = le claimer).
 */

type RouteContext = { params: Promise<{ runId: string }> };

const ACTIVE = ["queued", "running", "needs_input"];
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

  if (!ACTIVE.includes(run.status)) {
    return NextResponse.json({ error: "Run is not active" }, { status: 409 });
  }

  await insertRunMessage(runId, auth.user.id, message);
  // Un message relance l'horloge d'inactivité (empêche le reaping imminent).
  await bumpRunActivity(runId);

  // Reprise d'un run au repos (ask_user OU fin de tour) : nouveau tour.
  if (run.status === "needs_input") {
    const resumed = await stampRun(
      runId,
      { status: "queued", not_before: new Date().toISOString() },
      { guard: ["needs_input"] },
    );
    if (resumed) kickAgentDrain(getServiceClient());
  }

  return NextResponse.json({ ok: true, status: run.status });
}
