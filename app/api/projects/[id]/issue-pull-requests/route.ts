import { listIssuePullRequests } from "@/lib/server/agent/issue-pull-requests";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { pickIssuePullRequests } from "@/lib/server/agent/activity";

/**
 * Pull request by issue of one project (MIN-163), in every state. `pull_requests`
 * does not know the project (a PR is a fact of the REPOSITORY), so
 * `listIssuePullRequests` goes through an inner join on the ticket.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const prs = await listIssuePullRequests(auth.supabase, { projectId: id });
  return NextResponse.json({ pullRequests: pickIssuePullRequests(prs) });
}
