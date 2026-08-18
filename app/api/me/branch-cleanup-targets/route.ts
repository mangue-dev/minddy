import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isRepoProviderId } from "@/lib/repo-providers";
import type { BranchCleanupTarget } from "@/lib/types";

/**
 * GET /api/me/branch-cleanup-targets — projects where branch cleaning
 * of agent (MIN-102) makes sense, all projects combined. The palette command is
 * serves to offer the action from anywhere, not just from the project.
 *
 * A project is selected if it meets the three conditions of the button
 * parameters: I am the OWNER, a repository is linked to it, and at least one run
 * agent pushed a branch there. This last condition is read in base
 * (`agent_runs.branch_name`): find out if there are really branches left to
 * delete would require interrogating the forge for each project — far too much
 * expensive to populate a list. The dialogue says it exactly.
 *
 * Everything goes through the caller's client: RLS (`can_access_project`) terminal
 * already reading to my projects, and the owner filter is set to `owner_id`.
 */

/** List population route: never cached by the platform. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const [projectsRes, linksRes] = await Promise.all([
    auth.supabase.from("projects").select("id, owner_id").is("deleted_at", null),
    auth.supabase
      .from("project_git_links")
      .select("project_id, provider, repo_full_name"),
  ]);

  const firstError = projectsRes.error || linksRes.error;
  if (firstError) {
    console.error("[api/me/branch-cleanup-targets] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const ownedIds = new Set(
    ((projectsRes.data ?? []) as { id: string; owner_id: string }[])
      .filter((p) => p.owner_id === auth.user.id)
      .map((p) => p.id),
  );

  const candidates = (
    (linksRes.data ?? []) as {
      project_id: string;
      provider: string;
      repo_full_name: string | null;
    }[]
  ).filter((l) => ownedIds.has(l.project_id) && isRepoProviderId(l.provider));

  // One existence per candidate project, in parallel: `limit(1)` only brings back one
  // id where a global `select` would return one uuid per run. The candidates
  // count on the fingers of one hand — a related project of which I am the owner.
  const withBranches = await Promise.all(
    candidates.map(async (link) => {
      const { data } = await auth.supabase
        .from("agent_runs")
        .select("id")
        .eq("project_id", link.project_id)
        .not("branch_name", "is", null)
        .limit(1);
      return (data ?? []).length > 0 ? link : null;
    }),
  );

  const targets: BranchCleanupTarget[] = withBranches
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => ({
      project_id: l.project_id,
      provider: l.provider as BranchCleanupTarget["provider"],
      repo_full_name: l.repo_full_name,
    }));

  return NextResponse.json({ targets });
}
