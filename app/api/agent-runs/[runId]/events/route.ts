import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun } from "@/lib/server/agent/runs";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Flux d'événements d'un run (MIN-46) pour le live view. `?after=<seq>` renvoie
 * les events strictement postérieurs (polling incrémental) ; sans lui, tous.
 * Lecture = membre du projet du run.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const afterParam = request.nextUrl.searchParams.get("after");
  const after = afterParam != null ? Number(afterParam) : -1;

  const service = getServiceClient();
  let query = service
    .from("agent_run_events")
    .select("id, seq, type, payload, created_at")
    .eq("run_id", runId)
    .order("seq", { ascending: true });
  if (Number.isFinite(after) && after >= 0) query = query.gt("seq", after);

  const { data } = await query;
  return NextResponse.json({ events: data ?? [] });
}
