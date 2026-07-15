import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { buildAgentActivity, type AgentRunRow } from "@/lib/server/agent/activity";

/**
 * État de l'agent par issue, TOUS projets accessibles confondus (board global
 * « Tous les tickets », MIN-29/MIN-46). Même contrat que l'endpoint par projet
 * (working / session / PR par issue, voir buildAgentActivity) mais sans filtre
 * projet — la RLS agent_runs = can_access_project borne l'appelant.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Toute session REPRENNABLE (tout sauf `failed`) : un run terminé après PR reste
  // ouvrable pour itérer.
  const { data } = await auth.supabase
    .from("agent_runs")
    .select("issue_id, status, id, pr_number, pr_state, created_at")
    .neq("status", "failed")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as AgentRunRow[];
  return NextResponse.json(buildAgentActivity(rows));
}
