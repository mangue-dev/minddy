import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Branches from the repository linked to the issue project (basic branch picker at
 * launching an agent). Served by the provider API through a fresh token —
 * `defaultBranch` at the top, the rest in alphabetical order.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: the caller must be able to see the outcome (and their plan with it).
  const { data: issue } = await auth.supabase
    .from("issues")
    .select("id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  try {
    const target = await resolveRepoCloneTarget((issue as { project_id: string }).project_id);
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
