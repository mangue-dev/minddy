import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/project-drafts/[id] — discard a draft.
 *
 * Two callers: the sidebar context menu (“Delete
 * draft"), and the wizard itself once the project has been created — the draft has
 * then does its job. No trash: a draft is not data
 * of the project, it is a half-filled form.
 *
 * The RLS does the sorting (we only delete its own): an unknown id does not affect
 * no line and still responds 204 — the deletion is idempotent, and
 * replaying a DELETE should not show an error.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { error } = await auth.supabase
    .from("project_drafts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[api/project-drafts/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
