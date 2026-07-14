import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Issues d'un projet ayant un run d'agent ACTIF (MIN-46) — alimente l'effet de
 * halo « arc-en-ciel » sur les cartes du board. RLS agent_runs = can_access_project
 * → le cookie client suffit (l'appelant ne voit que ses projets accessibles).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from("agent_runs")
    .select("issue_id")
    .eq("project_id", id)
    .in("status", ["queued", "running", "needs_input"]);

  const activeIssueIds = [
    ...new Set(((data ?? []) as Array<{ issue_id: string }>).map((r) => r.issue_id)),
  ];
  return NextResponse.json({ activeIssueIds });
}
