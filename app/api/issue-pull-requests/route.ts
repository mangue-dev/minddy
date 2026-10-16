import { listIssuePullRequests } from "@/lib/server/agent/issue-pull-requests";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  issuePullRequestsForBindings,
  pickIssuePullRequests,
  type ProjectRepoBindingRow,
} from "@/lib/server/agent/activity";

/**
 * Pull request by issue, ALL accessible projects combined (global board “All
 * tickets”). Same contract as the per-project endpoint. RLS `pull_requests` = an
 * accessible project links this repository; `issuePullRequestsForBindings`
 * then requires the issue's project to be the one that links it.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const requestedProjects = [...new Set(request.nextUrl.searchParams.getAll("projectId"))].slice(0, 100);
  let linksQuery = auth.supabase
    .from("project_git_links")
    .select("project_id, provider, repo_full_name");
  if (requestedProjects.length > 0) {
    linksQuery = linksQuery.in("project_id", requestedProjects);
  }
  const [prs, { data: links }] = await Promise.all([
    listIssuePullRequests(auth.supabase),
    linksQuery,
  ]);

  const scopedPrs = issuePullRequestsForBindings(
    prs,
    (links ?? []) as ProjectRepoBindingRow[],
  );
  return NextResponse.json({ pullRequests: pickIssuePullRequests(scopedPrs) });
}
