import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { createIssueForProject } from "@/lib/server/create-issue";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";

type RouteContext = { params: Promise<{ id: string }> };

// Headroom for the Smart Assign after() run (one AI call post-response).
export const maxDuration = 60;

/** GET /api/projects/[id]/issues — all issues of an accessible project. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // RLS issues_select scopes to accessible projects; ordering by position then
  // number gives a stable per-column order.
  const { data, error } = await auth.supabase
    .from("issues")
    .select(ISSUE_SELECT)
    .eq("project_id", id)
    .order("position", { ascending: true })
    .order("number", { ascending: true });

  if (error) {
    console.error("[api/issues] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Issue-level attachment counts (comment attachments excluded) — one indexed
  // query, folded onto each issue so « copier le prompt » can flag attachments
  // in the XML without a per-card fetch. Failure is non-fatal: the board still
  // renders, just without the counts.
  const attachmentCounts = new Map<string, number>();
  const { data: attachmentRows, error: attachmentError } = await auth.supabase
    .from("attachments")
    .select("issue_id")
    .eq("project_id", id)
    .is("comment_id", null);
  if (attachmentError) {
    console.error("[api/issues] attachment counts failed:", attachmentError.message);
  } else {
    for (const row of attachmentRows ?? []) {
      const issueId = row.issue_id as string;
      attachmentCounts.set(issueId, (attachmentCounts.get(issueId) ?? 0) + 1);
    }
  }

  return NextResponse.json(
    (data ?? []).map((row) => {
      const mapped = mapIssueRow(row);
      const issueId = (row as { id: string }).id;
      return { ...mapped, attachment_count: attachmentCounts.get(issueId) ?? 0 };
    })
  );
}

/** POST /api/projects/[id]/issues — create an issue (assigns CLÉ-number atomically). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await createIssueForProject({
    projectId: id,
    projectName: access.project.name,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message =
      result.rawMessage ?? t(result.errorKey ?? "databaseError", result.params);
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.issue, { status: 201 });
}
