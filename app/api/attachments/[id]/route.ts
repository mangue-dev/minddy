import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { removeStorageObjects } from "@/lib/server/attachments";

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE /api/attachments/[id] — remove one attachment (uploader-only,
    enforced by RLS), then best-effort delete of the storage object. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("attachments")
    .delete()
    .eq("id", id)
    .select("storage_path")
    .maybeSingle();

  if (error) {
    console.error("[api/attachments/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("attachmentNotFound") }, { status: 404 });
  }

  await removeStorageObjects(getServiceClient(), [data.storage_path]);
  return NextResponse.json({ ok: true });
}
