import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * GET /api/projects/git-linked — accessible projects that have a linked REPOS.
 *
 * The agent clones a repository: a project which does not have one is not a project where the
 * throw. The Agents page uses this to only offer those, rather than
 * let choose then refuse (`noRepo`) once the message has been written.
 *
 * Single query for ALL projects — link status read so far
 * project by project (`/api/projects/[id]/git-link`), which goes for one panel
 * ticket but not to populate a selector.
 *
 * Only renders IDS: the rest of the link (repository, default branch, account) is
 * detail of settings, and the selector does not need it. The RLS
 * `project_git_links_select` (`can_access_project`) does the filtering.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("project_git_links")
    .select("project_id");

  if (error) {
    console.error("[api/projects/git-linked] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const projectIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.project_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  return NextResponse.json({ projectIds });
}
