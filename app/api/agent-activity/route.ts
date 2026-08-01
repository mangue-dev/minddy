import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  buildAgentActivity,
  type AgentRunRow,
  type IssuePrRow,
} from "@/lib/server/agent/activity";

/**
 * État de l'agent par issue, TOUS projets accessibles confondus (board global
 * « Tous les tickets », MIN-29/MIN-46). Même contrat que l'endpoint par projet
 * (working / session / PR par issue, voir buildAgentActivity) mais sans filtre
 * projet — la RLS agent_runs = can_access_project borne l'appelant.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Tous les runs sauf `failed` : `buildAgentActivity` en dérive les runs ACTIFS
  // (carte « Ouvrir l'agent »). La PR, elle, vient de sa propre table depuis
  // MIN-163 — un ticket peut en porter une sans qu'aucun run ne l'ait ouverte.
  // RLS `pull_requests` = un projet accessible lie ce dépôt.
  const [{ data }, { data: prs }] = await Promise.all([
    auth.supabase
      .from("agent_runs")
      .select("issue_id, status, id, pr_number, pr_state, created_at")
      .neq("status", "failed")
      .order("created_at", { ascending: false }),
    auth.supabase
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at")
      .not("issue_id", "is", null)
      .order("updated_at", { ascending: false }),
  ]);

  const rows = (data ?? []) as AgentRunRow[];
  return NextResponse.json(buildAgentActivity(rows, (prs ?? []) as IssuePrRow[]));
}
