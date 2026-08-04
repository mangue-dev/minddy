import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { buildMembersByProject } from "@/lib/server/project-members";
import type {
  Category,
  SearchIndexIssue,
  SearchIndexObjective,
} from "@/lib/types";

/**
 * Row caps. The palette is a search box, not a browser: past a few thousand
 * rows nobody scrolls, they type — and the cost of the extra rows is paid on
 * every keystroke by the scoring loop. Ordering is `updated_at desc`, so what
 * gets dropped is what the workspace stopped touching. `truncated` says so.
 */
const MAX_ISSUES = 4000;
const MAX_OBJECTIVES = 1000;

/**
 * Only the columns a palette row displays, matches on, or lets ⌘; patch — plus
 * `projects!inner(deleted_at)`, which isn't displayed at all: it's the trash
 * filter. Trashing a project leaves its issues untouched (DELETE
 * /api/projects/[id]) and `can_access_project` ignores `deleted_at`, so without
 * the join the palette keeps offering tickets of a project the sidebar no
 * longer lists. Same join as GET /api/me/summary and lib/server/cycles.ts. It
 * is stripped from every row before the response — see `stripJoin`.
 */
const ISSUE_COLUMNS =
  "id, project_id, number, title, status, priority, effort, assignee_id, objective_id, updated_at, projects!inner(deleted_at)";
const OBJECTIVE_COLUMNS = "id, project_id, name, status, color, projects!inner(deleted_at)";

/** La jointure de filtrage ne descend pas au client. */
function stripJoin<T>(rows: ({ projects?: unknown } | null)[] | null): T[] {
  return (rows ?? []).map((row) => {
    const { projects: _projects, ...rest } = (row ?? {}) as { projects?: unknown };
    return rest as T;
  });
}

/**
 * GET /api/me/search-index — every ticket and objective of every project I can
 * access, in the lightest shape that still makes a command-palette row (MIN-91).
 *
 * Why a route of its own rather than GET /api/me/board: that one is the
 * cross-project *kanban* payload — full issue rows (description + plan, up to
 * 64 Ko each), relations, integrations, and a cycle reconciliation that WRITES
 * (rollover, auto-fill). None of that belongs in a read the palette fires in
 * the background on pages that have nothing to do with a board.
 *
 * Issues, objectives and categories are read through the user's client, so RLS
 * (`can_access_project`) scopes them to my projects. Members need the service
 * client (see lib/server/project-members.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const service = getServiceClient();

  const [issuesRes, objectivesRes, categoriesRes, projectsRes] = await Promise.all([
    auth.supabase
      .from("issues")
      .select(ISSUE_COLUMNS)
      .is("projects.deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(MAX_ISSUES),
    auth.supabase
      .from("objectives")
      .select(OBJECTIVE_COLUMNS)
      .is("projects.deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(MAX_OBJECTIVES),
    auth.supabase.from("categories").select("id, project_id, name, color"),
    auth.supabase.from("projects").select("id, owner_id").is("deleted_at", null),
  ]);

  const firstError =
    issuesRes.error || objectivesRes.error || categoriesRes.error || projectsRes.error;
  if (firstError) {
    console.error("[api/me/search-index] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const issues = stripJoin<SearchIndexIssue>(issuesRes.data);
  const objectives = stripJoin<SearchIndexObjective>(objectivesRes.data);

  const categories: Record<string, Category[]> = {};
  for (const c of (categoriesRes.data ?? []) as Category[]) {
    (categories[c.project_id] ??= []).push(c);
  }

  const { members } = await buildMembersByProject(
    service,
    (projectsRes.data ?? []) as { id: string; owner_id: string }[]
  );

  return NextResponse.json({
    issues,
    objectives,
    members,
    categories,
    truncated: issues.length >= MAX_ISSUES || objectives.length >= MAX_OBJECTIVES,
  });
}
