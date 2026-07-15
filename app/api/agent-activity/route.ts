import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * État de l'agent par issue, TOUS projets accessibles confondus (board global
 * « Tous les tickets », MIN-29/MIN-46). Même contrat que l'endpoint par projet
 * (`{ workingIssueIds, sessionIssueIds }`) mais sans filtre projet — la RLS
 * agent_runs = can_access_project borne l'appelant à ses projets accessibles.
 *   • workingIssueIds — l'agent TRAVAILLE (queued/running) → halo animé ;
 *   • sessionIssueIds — session reprennable (working OU repos needs_input).
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from("agent_runs")
    .select("issue_id, status")
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
