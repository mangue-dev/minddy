import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { removeStorageObjects } from "@/lib/server/attachments";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/resources/[id] — remove one resource, file or link, then
 * best-effort delete of the storage object. A link has none — its favicon rides
 * the row.
 *
 * Two guards, and it takes two (MIN-351). The applicant, first: the policy
 * Delete RLS no longer exists (a direct PostgREST delete would
 * leave the line leaving the storage object orphaned), so the control
 * lives here. And BELONGING to the project, then: “it’s me who has it
 * filed” does not survive the withdrawal of the project — without it, a former member
 * kept deleting his attachments in a project that is no longer his.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const service = getServiceClient();
  const { data: row } = await service
    .from("attachments")
    .select("project_id")
    .eq("id", id)
    .eq("created_by", auth.user.id)
    .maybeSingle();

  // Same 404 for “does not exist”, “filed by another” and “no longer a member”:
  // none of these three answers need be distinguishable from the other two.
  if (!row || !(await getProjectAccess(auth.user.id, row.project_id as string))) {
    return NextResponse.json({ error: t("resourceNotFound") }, { status: 404 });
  }

  const { data, error } = await service
    .from("attachments")
    .delete()
    .eq("id", id)
    .eq("created_by", auth.user.id)
    .select("storage_path")
    .maybeSingle();

  if (error) {
    console.error("[api/resources/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("resourceNotFound") }, { status: 404 });
  }

  if (data.storage_path) {
    await removeStorageObjects(service, [data.storage_path]);
  }
  return NextResponse.json({ ok: true });
}
