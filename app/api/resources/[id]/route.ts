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
 * Deux gardes, et il en faut deux (MIN-351). Le déposant, d'abord : la policy
 * RLS de suppression n'existe plus (une suppression PostgREST directe ferait
 * partir la ligne en laissant l'objet de storage orphelin), donc le contrôle
 * vit ici. Et l'APPARTENANCE au projet, ensuite : « c'est moi qui l'ai
 * déposé » ne survit pas au retrait du projet — sans elle, un ancien membre
 * continuait d'effacer ses pièces jointes dans un projet qui n'est plus le sien.
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

  // Même 404 pour « n'existe pas », « déposée par un autre » et « plus membre » :
  // aucune de ces trois réponses n'a à être distinguable des deux autres.
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
