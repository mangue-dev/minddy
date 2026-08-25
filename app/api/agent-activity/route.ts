import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  buildAgentActivity,
  issuePullRequestsForBindings,
  type AgentRunRow,
  type IssuePrRow,
  type ProjectRepoBindingRow,
  type ScopedIssuePrRow,
} from "@/lib/server/agent/activity";

/**
 * Agent status by outcome, ALL accessible projects combined (global board
 * “All tickets”, MIN-29/MIN-46). Same contract as the endpoint per project
 * (working / session / PR per issue, see buildAgentActivity) but without a filter
 * project — RLS agent_runs = can_access_project terminates the caller.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // All runs except `failed`: `buildAgentActivity` derives ACTIVE runs
  // (“Open agent” card). PR comes from its own table since
  // MIN-163 — a ticket can carry one without any run having opened it.
  // RLS `pull_requests` = an accessible project links this repository.
  const requestedProjects = [...new Set(request.nextUrl.searchParams.getAll("projectId"))].slice(0, 100);
  let runsQuery = auth.supabase
      .from("agent_runs")
      .select("issue_id, status, id, pr_number, pr_state, created_at")
      .neq("status", "failed")
      .order("created_at", { ascending: false });
  let linksQuery = auth.supabase
    .from("project_git_links")
    .select("project_id, provider, repo_full_name");
  if (requestedProjects.length > 0) {
    runsQuery = runsQuery.in("project_id", requestedProjects);
    linksQuery = linksQuery.in("project_id", requestedProjects);
  }
  const [{ data }, { data: prs }, { data: links }] = await Promise.all([
    runsQuery,
    auth.supabase
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at, provider, repo_full_name, issue:issues!inner(project_id)")
      .not("issue_id", "is", null)
      .order("updated_at", { ascending: false }),
    linksQuery,
  ]);

  const rows = (data ?? []) as AgentRunRow[];
  const scopedPrs = issuePullRequestsForBindings(
    (prs ?? []) as unknown as ScopedIssuePrRow[],
    (links ?? []) as ProjectRepoBindingRow[],
  );
  return NextResponse.json(buildAgentActivity(rows, scopedPrs as IssuePrRow[]));
}
