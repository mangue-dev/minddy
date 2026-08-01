import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  buildAgentActivity,
  type AgentRunRow,
  type IssuePrRow,
} from "@/lib/server/agent/activity";

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
  // (carte « Ouvrir l'agent »). Les runs CARNET (MIN-84, issue_id null) ne
  // portent aucune activité d'issue : exclus.
  //
  // La PR vient de sa propre table depuis MIN-163 — un ticket peut en porter une
  // sans qu'aucun run ne l'ait ouverte. `pull_requests` ne connaît pas le projet
  // (une PR est un fait du DÉPÔT) : on passe donc par une jointure INTERNE sur
  // le ticket, qui, lui, le connaît.
  const [{ data }, { data: prs }] = await Promise.all([
    auth.supabase
      .from("agent_runs")
      .select("issue_id, status, id, pr_number, pr_state, created_at")
      .eq("project_id", id)
      .neq("status", "failed")
      .not("issue_id", "is", null)
      .order("created_at", { ascending: false }),
    auth.supabase
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at, issue:issues!inner(project_id)")
      .eq("issue.project_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  const rows = (data ?? []) as AgentRunRow[];
  return NextResponse.json(
    buildAgentActivity(rows, (prs ?? []) as unknown as IssuePrRow[]),
  );
}
