import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * État de l'agent par issue d'un projet (MIN-46). Deux ensembles :
 *   • workingIssueIds — l'agent TRAVAILLE (queued/running) → halo animé sur la carte ;
 *   • sessionIssueIds — une session reprennable existe (working OU repos needs_input)
 *                       → l'entrée de la carte propose « Ouvrir l'agent ».
 * RLS agent_runs = can_access_project → le cookie client suffit (l'appelant ne voit
 * que ses projets accessibles).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from("agent_runs")
    .select("issue_id, status")
    .eq("project_id", id)
    .in("status", ["queued", "running", "needs_input"]);

  const rows = (data ?? []) as Array<{ issue_id: string; status: string }>;
  const workingIssueIds = [
    ...new Set(
      rows
        .filter((r) => r.status === "queued" || r.status === "running")
        .map((r) => r.issue_id),
    ),
  ];
  const sessionIssueIds = [...new Set(rows.map((r) => r.issue_id))];
  return NextResponse.json({ workingIssueIds, sessionIssueIds });
}
