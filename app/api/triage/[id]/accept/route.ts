import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { createIssueForProject } from "@/lib/server/create-issue";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/triage/[id]/accept — turn a pending proto-issue into a real issue.
 * Body = CreateIssueInput (the fields set in the create dialog; title and
 * description may have been reworked there). Creates the issue first, then
 * marks the item accepted — never the other way around.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // The RLS-scoped read doubles as proof of project access — required before
  // createIssueForProject, whose insert bypasses RLS.
  const { data: item, error: itemError } = await auth.supabase
    .from("triage_items")
    .select("id, project_id, status")
    .eq("id", id)
    .maybeSingle();

  if (itemError) {
    console.error("[api/triage] accept lookup failed:", itemError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!item || item.status !== "pending") {
    return NextResponse.json({ error: t("triageItemNotFound") }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await createIssueForProject({
    projectId: item.project_id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }

  // The issue exists — a failure here only leaves a stale pending item that
  // can be re-processed by hand, so log and still report success.
  const { error: markError } = await auth.supabase
    .from("triage_items")
    .update({
      status: "accepted",
      issue_id: result.issue.id as string,
      processed_by: auth.user.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (markError) {
    console.error("[api/triage] accept mark failed:", markError.message);
  }

  return NextResponse.json(result.issue, { status: 201 });
}
