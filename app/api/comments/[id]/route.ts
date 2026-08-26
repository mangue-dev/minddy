import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { removeStorageObjects } from "@/lib/server/attachments";
import { deleteCommentThreadAtomic } from "@/lib/server/comment-lifecycle";
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

  let deleted;
  try {
    deleted = await deleteCommentThreadAtomic(auth.supabase, id);
  } catch (error) {
    console.error("[api/comments/:id] delete failed:", (error as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (deleted.status === "not_found") {
    return NextResponse.json({ error: t("commentNotFound") }, { status: 404 });
  }

  await removeStorageObjects(getServiceClient(), deleted.storagePaths);
  return NextResponse.json({ ok: true });
}
