import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { listIssueCodeWork } from "@/lib/server/git/issue-code-work";
import { issueStore } from "@/lib/server/issue-store";

/**
 * The commits and branches tracked for an issue (MIN-1037): work pushed
 * without a pull request, listed in the side panel under its properties.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: the caller must be able to see the issue, and the rows follow it.
  const { data: issue } = await issueStore(auth.supabase).select("id, project_id")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  const found = issue as { id: string; project_id: string } | null;
  if (!found) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  return NextResponse.json(
    await listIssueCodeWork(auth.supabase, { id: found.id, projectId: found.project_id }),
  );
}
