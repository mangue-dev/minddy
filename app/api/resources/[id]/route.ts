import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { removeStorageObjects, renameAttachment } from "@/lib/server/attachments";
import { normalizeResourceName } from "@/lib/resource-name";

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
    .select("project_id, comment_id")
    .eq("id", id)
    .eq("created_by", auth.user.id)
    .maybeSingle();

  // Same 404 for “does not exist”, “filed by another” and “no longer a member”:
  // none of these three answers need be distinguishable from the other two.
  const access = row ? await getProjectAccess(auth.user.id, row.project_id as string) : null;
  if (!row || !access) {
    return NextResponse.json({ error: t("resourceNotFound") }, { status: 404 });
  }
  // A file inside one's own comment follows the comment capability; a
  // standalone resource is project content and needs write access (MIN-693).
  if (!(row.comment_id ? access.canComment : access.canWrite)) {
    return NextResponse.json({ error: t("readOnlyProject") }, { status: 403 });
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

/**
 * PATCH /api/resources/[id] — rename one file or link (MIN-742). Body:
 * `{ file_name }`. Answers the updated row.
 *
 * The same two guards as DELETE, for the same reasons: the uploader alone, and
 * only while they still belong to the project with the matching capability.
 * A page resource has no name of its own (the chip shows the page's live
 * title), so it is refused.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const body = (await request.json().catch(() => null)) as { file_name?: unknown } | null;
  const fileName = normalizeResourceName(body?.file_name);
  if (!fileName) {
    return NextResponse.json({ error: t("resourceNameInvalid") }, { status: 400 });
  }

  const service = getServiceClient();
  const { data: row } = await service
    .from("attachments")
    .select("project_id, comment_id, kind")
    .eq("id", id)
    .eq("created_by", auth.user.id)
    .maybeSingle();

  const access = row ? await getProjectAccess(auth.user.id, row.project_id as string) : null;
  if (!row || !access) {
    return NextResponse.json({ error: t("resourceNotFound") }, { status: 404 });
  }
  if (!(row.comment_id ? access.canComment : access.canWrite)) {
    return NextResponse.json({ error: t("readOnlyProject") }, { status: 403 });
  }
  if (row.kind === "page") {
    return NextResponse.json({ error: t("resourceNotRenamable") }, { status: 400 });
  }

  try {
    const renamed = await renameAttachment(service, {
      id,
      projectId: row.project_id as string,
      fileName,
    });
    if (!renamed) {
      return NextResponse.json({ error: t("resourceNotFound") }, { status: 404 });
    }
    return NextResponse.json(renamed);
  } catch (error) {
    console.error("[api/resources/:id] rename failed:", (error as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
