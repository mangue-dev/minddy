import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { createIssueForProject } from "@/lib/server/create-issue";
import { ISSUE_SELECT } from "@/lib/server/issue-mapper";
import { buildProjectIssueResponse } from "@/lib/server/project-issue-response";

type RouteContext = { params: Promise<{ id: string }> };

// Enough to cover the two automations of creation: Smart-fill, which
// runs IN the request and therefore delays the response (a model call, limited to
// 20 s — this is the price of a line that is complete, cf. lib/server/smart-fill.ts),
// and the call to Smart Assign, which returns to `after()` once the response is given.
export const maxDuration = 60;

/** GET /api/projects/[id]/issues — all issues of an accessible project. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // The issue rows and their resource counts are independent reads. Running
  // them together removes one database round trip from every cold board load.
  const [t, issuesResult, resourcesResult] = await Promise.all([
    getTranslations("ApiErrors"),
    // RLS issues_select scopes to accessible projects; ordering by position then
    // number gives a stable per-column order.
    auth.supabase
      .from("issues")
      .select(ISSUE_SELECT)
      .eq("project_id", id)
      .order("position", { ascending: true })
      .order("number", { ascending: true }),
    auth.supabase
      .from("attachments")
      .select("issue_id")
      .eq("project_id", id)
      .is("comment_id", null),
  ]);
  const { data, error } = issuesResult;

  if (error) {
    console.error("[api/issues] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Issue-level resource counts, files and links alike (the ones on comments
  // excluded) — one indexed query, folded onto each issue so « copy the
  // prompt » can flag resources in the XML without a per-card fetch. Failure is
  // non-fatal: the board still renders, just without the counts.
  const { data: resourceRows, error: resourceError } = resourcesResult;
  if (resourceError) {
    console.error("[api/issues] resource counts failed:", resourceError.message);
  }

  return NextResponse.json(
    buildProjectIssueResponse(data ?? [], resourceError ? [] : (resourceRows ?? [])),
  );
}

/** POST /api/projects/[id]/issues — create an issue (assigns KEY-number atomically). */
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

  const payload = (body ?? {}) as Record<string, unknown>;
  const result = await createIssueForProject({
    projectId: id,
    projectName: access.project.name,
    actorId: auth.user.id,
    input: payload,
    // The id that the optimistic card already carries on the browser side: the line is born
    // with, otherwise the direct reports a creation that the client does not recognize
    // like his and the map appears in duplicate (lib/optimistic-issue.ts).
    // Validated as UUID by the core, which otherwise ignores it.
    rowId: typeof payload.id === "string" ? payload.id : null,
  });
  if (!result.ok) {
    const message =
      result.rawMessage ?? t(result.errorKey ?? "databaseError", result.params);
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.issue, { status: 201 });
}
