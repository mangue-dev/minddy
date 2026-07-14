import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun } from "@/lib/server/agent/runs";
import { getServiceClient } from "@/lib/supabase-service";
import { createOrReconnectSandbox, stopSandbox } from "@/lib/server/agent/sandbox";

/**
 * Annule un run d'agent (MIN-46). Passe le run en `canceled` (garde : seulement
 * s'il est actif) — le stamp gardé de l'exécuteur ne le réécrira pas — et arrête
 * au mieux la microVM. Membre du projet requis.
 */

type RouteContext = { params: Promise<{ runId: string }> };

const ACTIVE = ["queued", "running", "needs_input"];

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!ACTIVE.includes(run.status)) {
    return NextResponse.json({ ok: true, status: run.status });
  }

  // Signale l'annulation UNIQUEMENT via run.status (l'UI le reflète) : on n'écrit
  // PAS d'event ici — un seul écrivain d'events (le claimer), sinon collision de seq.
  const service = getServiceClient();
  await service
    .from("agent_runs")
    .update({ status: "canceled", checkpoint: null })
    .eq("id", runId)
    .in("status", ACTIVE);

  // Best-effort : libère la microVM (elle expirerait sinon d'elle-même).
  if (run.sandbox_id) {
    try {
      const { sandbox } = await createOrReconnectSandbox(run.sandbox_id);
      await stopSandbox(sandbox);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, status: "canceled" });
}
