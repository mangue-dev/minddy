import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  buildAgentActivity,
  type AgentRunRow,
  type IssuePrRow,
} from "@/lib/server/agent/activity";

/**
 * Agent status by project issue (MIN-46): working / session / PR by issue
 * (see buildAgentActivity). RLS agent_runs = can_access_project → the client cookie
 * is enough (the caller only sees his accessible projects).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // All runs except `failed`: `buildAgentActivity` derives ACTIVE runs
  // (“Open agent” card). NOTEBOOK runs (MIN-84, issue_id null) do not
  // carry no issue activity: excluded.
  //
  // The PR comes from its own table since MIN-163 — a ticket can carry one
  // without any run having opened it. `pull_requests` does not know the project
  // (a PR is a fact of the DEPOSIT): we therefore go through an INTERNAL join on
  // the ticket, who knows it.
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
