import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { removeStorageObjects } from "@/lib/server/attachments";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ id: string }> };

// Length cap (MIN-118) — same cap as lib/server/add-comment.ts.
const MAX_COMMENT_LENGTH = 65_536;

/** PATCH /api/comments/[id] — edit (author-only, enforced by RLS). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const text = typeof (body as { body?: unknown })?.body === "string"
    ? ((body as { body: string }).body).trim().slice(0, MAX_COMMENT_LENGTH)
    : "";
  if (!text) {
    return NextResponse.json({ error: t("commentEmpty") }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("comments")
    .update({ body: text })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/comments/:id] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("commentNotFound") }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/comments/[id] — delete (author-only, enforced by RLS). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // Snapshot storage paths first — deleting a thread root cascades its replies
  // (parent_id FK), whose resource rows go with them. Objects are removed
  // only once the delete succeeds. A LINK resource has no purpose
  // (`storage_path` null, MIN-184): discard it here, otherwise the list would carry a
  // null that `storage.remove()` refuses IN BLOCK — a single link on the thread, and
  // no more comment files would be deleted.
  const service = getServiceClient();
  const { data: replies } = await service
    .from("comments")
    .select("id")
    .eq("parent_id", id);
  const commentIds = [id, ...(replies ?? []).map((r) => r.id as string)];
  const { data: attachmentRows } = await service
    .from("attachments")
    .select("storage_path")
    .in("comment_id", commentIds)
    .not("storage_path", "is", null);

  const { data, error } = await auth.supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/comments/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("commentNotFound") }, { status: 404 });

  await removeStorageObjects(
    service,
    (attachmentRows ?? []).map((a) => a.storage_path as string)
  );
  return NextResponse.json({ ok: true });
}
