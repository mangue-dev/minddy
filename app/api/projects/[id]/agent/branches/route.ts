import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Branches of the repository linked to a PROJECT (basic branch picker when launching a
 * run NOTEBOOK, MIN-84 — mirror of /api/issues/[id]/agent/branches, anchored project).
 * Served by the provider's API via a fresh token — `defaultBranch` at the top, the
 * remains in alphabetical order.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: The caller must be able to see the project.
  const { data: project } = await auth.supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const target = await resolveRepoCloneTarget(id);
    if (!target) {
      return NextResponse.json({ error: "noRepo", code: "noRepo" }, { status: 409 });
    }
    const names = await forgeFor(target.provider).listBranches({
      token: target.token,
      repoFullName: target.repoFullName,
    });
    // Default ALWAYS at the top, even if the paginated listing missed it (deposit at
    // hundreds of branches): this is the picker's fallback option.
    const rest = names
      .filter((n) => n !== target.defaultBranch)
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({
      branches: [target.defaultBranch, ...rest],
      defaultBranch: target.defaultBranch,
    });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
