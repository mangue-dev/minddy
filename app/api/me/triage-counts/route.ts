import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import type { ProjectTriageCount, TriageCountsResponse } from "@/lib/types";

/**
 * GET /api/me/triage-counts — what's waiting to be sorted in each of my
 * projects: tickets in triage status, and returns still open or planned.
 *
 * A separate route, based on the model of /api/me/smart-assign-warnings: the sidebar
 * carries these figures on ALL non-project pages, while
 * /api/me/summary — which reconciles the cycles timeline before reading —
 * is far too expensive to be mounted everywhere. Here, two `select` of ONE column,
 * on the only lines that expect something.
 *
 * The two halves are counted EXACTLY as the two mode tabs
 * project — the sidebar sorting counter and GET …/feedback/counts — for
 * that the number of a project line is the sum of the two badges that will be read
 * when entering it. A discrepancy here would be seen immediately.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Tickets go through the user's client: RLS
  // (`can_access_project`) limits reading to my projects. The tables
  // `feedback_*` are RLS deny-all (see supabase/migrations/…_feedback.sql),
  // hence a service-role reading limited to the ids read just before — under
  // RLS, therefore.
  //
  // This list ALSO serves as a scope: it excludes trashed projects,
  // and the account must exclude it with it (see the join below).
  const { data: projectRows, error: projectsError } = await auth.supabase
    .from("projects")
    .select("id")
    .is("deleted_at", null);
  if (projectsError) {
    console.error("[api/me/triage-counts] projects load failed:", projectsError.message);
    return NextResponse.json({ counts: {} } satisfies TriageCountsResponse);
  }
  const projectIds = ((projectRows ?? []) as { id: string }[]).map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json({ counts: {} } satisfies TriageCountsResponse);
  }

  const [triageRes, feedbackRes] = await Promise.all([
    // `projects!inner(deleted_at)` is not a read column, it is the FILTER of
    // the trash: throwing away a project does not affect its tickets (they come back
    // with him), and `can_access_project` does not look at `deleted_at` — those of a
    // Project thrown away therefore continue to pass RLS. Without this filter, they fell
    // in `counts` under the id of a project that the sidebar no longer lists: none
    // line did not carry them, but the “Home” badge — which IS the table —
    // mattered. A “+1” that could not be found anywhere, until
    // emptying the trash makes it disappear. Same join as the table
    // edge (app/api/me/summary/route.ts) and cycle reconciliation.
    auth.supabase
      .from("issues")
      .select("project_id, projects!inner(deleted_at)")
      .eq("status", "triage")
      .is("deleted_at", null)
      .is("projects.deleted_at", null),
    getServiceClient()
      .from("feedback_posts")
      .select("project_id")
      .is("deleted_at", null)
      .in("project_id", projectIds)
      .is("merged_into_id", null)
      .in("status", ["open", "planned"]),
  ]);

  // A reading failure is not a 500 error: these numbers decorate a
  // sidebar mounted on all pages, and a 500 per navigation would
  // more noise than the badge provides service. We journal, and half
  // who responded is displayed alone.
  if (triageRes.error) {
    console.error("[api/me/triage-counts] triage load failed:", triageRes.error.message);
  }
  if (feedbackRes.error) {
    console.error("[api/me/triage-counts] feedback load failed:", feedbackRes.error.message);
  }

  const counts: Record<string, ProjectTriageCount> = {};
  const bump = (projectId: string, half: keyof ProjectTriageCount) => {
    const entry = (counts[projectId] ??= { triage: 0, feedback: 0 });
    entry[half] += 1;
  };
  for (const row of (triageRes.data ?? []) as { project_id: string }[]) {
    bump(row.project_id, "triage");
  }
  for (const row of (feedbackRes.data ?? []) as { project_id: string }[]) {
    bump(row.project_id, "feedback");
  }

  return NextResponse.json({ counts } satisfies TriageCountsResponse);
}
