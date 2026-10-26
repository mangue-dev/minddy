import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Tickets of one project whose MCP agent has new comments to answer
 * (MIN-801), keyed by issue id: how many comments came after the agent's last
 * one, and when that was. The SQL function runs as the caller, so the issues
 * and comments policies decide what is visible.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase.rpc("issue_comment_follow_ups", { p_project_ids: [id] });
  if (error) return NextResponse.json({ error: "Unable to read comment follow-ups" }, { status: 500 });

  const followUps: Record<string, { count: number; since: string }> = {};
  for (const row of (data ?? []) as { issue_id: string; pending: number; since: string }[]) {
    followUps[row.issue_id] = { count: row.pending, since: new Date(row.since).toISOString() };
  }
  return NextResponse.json({ followUps });
}
