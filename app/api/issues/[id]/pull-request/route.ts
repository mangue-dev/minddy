import { listIssuePullRequests } from "@/lib/server/agent/issue-pull-requests";
import { issueStore } from "@/lib/server/issue-store";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { pickIssuePullRequests } from "@/lib/server/agent/activity";

/**
 * The pull request of an issue (MIN-163), in every state, for the side panel.
 * A ticket can carry a PR attached by branch convention or by hand from the PR
 * header; a live PR wins over a newer terminal one.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: the caller must be able to see the issue.
  const { data: issue } = await issueStore(auth.supabase).select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const prs = await listIssuePullRequests(auth.supabase, { issueId: id });
  return NextResponse.json({ pullRequest: pickIssuePullRequests(prs)[id] ?? null });
}
