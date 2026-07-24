import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { buildAgentActivity, type AgentRunRow } from "@/lib/server/agent/activity";

/**
 * État de l'agent par issue d'un projet (MIN-46) : working / session / PR par issue
 * (voir buildAgentActivity). RLS agent_runs = can_access_project → le cookie client
 * suffit (l'appelant ne voit que ses projets accessibles).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Tous les runs sauf `failed` : `buildAgentActivity` en dérive les runs ACTIFS
  // (carte « Ouvrir l'agent ») et la PR la plus récente de chaque issue. Les runs
  // CARNET (MIN-84, issue_id null) ne portent aucune activité d'issue : exclus.
  const { data } = await auth.supabase
    .from("agent_runs")
    .select("issue_id, status, id, pr_number, pr_state, created_at")
    .eq("project_id", id)
    .neq("status", "failed")
    .not("issue_id", "is", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as AgentRunRow[];
  return NextResponse.json(buildAgentActivity(rows));
}
