import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  SEMANTIC_MAX_PROJECTS,
  searchIssuesSemantically,
} from "@/lib/server/issue-semantic-search";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/issues/semantic-search?q=…&project=<id> — issue ids ranked by
 * meaning (MIN-718), for the pickers to append after their lexical results.
 *
 * The readable projects are resolved through the user's own client, so RLS
 * (`can_access_project`) decides the scope: a `project` the user cannot read
 * yields nothing, and without `project` the search covers the most recently
 * updated readable projects, at most 25. Only ids, project ids and scores
 * leave: each picker intersects them with its own eligible candidates, which
 * carry the title, the status filter and the exclusions.
 *
 * `status` says why there may be no hit (`skipped_query`, `opted_out`,
 * `budget_exhausted`, `unavailable`, `timeout`…): the picker keeps its
 * lexical results in every case, and never shows an error.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  // Pickers debounce, but a stuck key repeat must not turn into a bill.
  if (!checkSessionRateLimit(auth.user.id, "issue-semantic-search", { limit: 90 }).allowed) {
    return NextResponse.json({ status: "unavailable", hits: [] }, { status: 429 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const project = request.nextUrl.searchParams.get("project");
  if (project && !UUID_RE.test(project)) {
    return NextResponse.json({ status: "ok", hits: [] });
  }

  let projects = auth.supabase
    .from("projects")
    .select("id")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(SEMANTIC_MAX_PROJECTS);
  if (project) projects = projects.eq("id", project);
  const { data, error } = await projects;
  if (error) return NextResponse.json({ status: "unavailable", hits: [] });
  const projectIds = ((data ?? []) as { id: string }[]).map((row) => row.id);

  const result = await searchIssuesSemantically({ userId: auth.user.id, query, projectIds, limit: 10 });
  return NextResponse.json(
    { status: result.status, hits: result.hits.map(({ id, project_id }) => ({ id, project_id })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
