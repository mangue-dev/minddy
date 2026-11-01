import { issueStore } from "@/lib/server/issue-store";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedUserWithRlsReads } from "@/lib/server/api-auth";
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
  // Both RLS reads start together and overlap the live session check, which
  // still gates the response. The service-role feedback read below depends on
  // the project ids and therefore waits for both.
  const readScope = (supabase: SupabaseClient) => Promise.all([
    // Tickets go through the user's client: RLS (`can_access_project`) limits
    // reading to my projects. This list ALSO serves as a scope: it excludes
    // trashed projects, and the feedback read must exclude them with it.
    supabase.from("projects").select("id").is("deleted_at", null),
    // `projects!inner(deleted_at)` is not a read column, it is the FILTER of
    // the trash: throwing away a project does not affect its tickets (they come
    // back with it), and `can_access_project` does not look at `deleted_at`, so
    // the tickets of a trashed project continue to pass RLS. Without this
    // filter, they fell in `counts` under the id of a project that the sidebar
    // no longer lists, and the "Home" badge, which IS the table, counted them.
    // Same join as the table edge (app/api/me/summary/route.ts) and cycle
    // reconciliation.
    issueStore(supabase).select("project_id, projects!inner(deleted_at)")
      .eq("status", "triage")
      .is("deleted_at", null)
      .is("projects.deleted_at", null),
  ]);
  const auth = await getAuthedUserWithRlsReads(request, ({ supabase }) => readScope(supabase));
  if (!auth.ok) return auth.response;

  const [{ data: projectRows, error: projectsError }, triageRes] = await (auth.reads ?? readScope(auth.supabase));
  if (projectsError) {
    console.error("[api/me/triage-counts] projects load failed:", projectsError.message);
    return NextResponse.json({ counts: {} } satisfies TriageCountsResponse);
  }
  const projectIds = ((projectRows ?? []) as { id: string }[]).map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json({ counts: {} } satisfies TriageCountsResponse);
  }

  // The `feedback_*` tables are RLS deny-all (see
  // supabase/migrations/…_feedback.sql), hence a service-role read limited to
  // the ids read under RLS above. It cannot be expressed without them.
  const feedbackRes = await getServiceClient()
    .from("feedback_posts")
    .select("project_id")
    .is("deleted_at", null)
    .in("project_id", projectIds)
    .is("merged_into_id", null)
    .in("status", ["open", "planned"]);

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
