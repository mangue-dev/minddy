import { listProjectPullRequestTimeline } from "@/lib/server/agent/issue-pull-requests";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Pull requests linked to the tickets of one project, with their dates, for
 * the project statistics (MIN-878). Like `issue-pull-requests`, the inner
 * join on the ticket under the caller's RLS is the project boundary.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const pullRequests = await listProjectPullRequestTimeline(auth.supabase, id);
  return NextResponse.json({ pullRequests });
}
