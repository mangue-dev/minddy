import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; commentId: string }>;
};

/** Same limit as comment creation in lib/server/page-comments.ts. */
const MAX_COMMENT_LENGTH = 65_536;

/**
 * PATCH — edit your own comment (MIN-282).
 *
 * The session client enforces author ownership and live-page membership through
 * RLS. An invisible comment updates no row and returns the same 404 as a missing
 * comment.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { pageId, commentId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const text =
    typeof (body as { body?: unknown })?.body === "string"
      ? (body as { body: string }).body.trim().slice(0, MAX_COMMENT_LENGTH)
      : "";
  if (!text) {
    return NextResponse.json({ error: t("commentEmpty") }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("page_comments")
    .update({ body: text })
    // Keep ownership and route scope explicit in addition to the policy. The
    // filters make the route's behavior readable and preserve a uniform 404.
    .eq("id", commentId)
    .eq("page_id", pageId)
    .eq("author_id", auth.user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/pages/:id/comments/:cid] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("commentNotFound") }, { status: 404 });
  }
  return NextResponse.json(data);
}

/**
 * DELETE removes the caller's own comment. A root carries its replies through
 * the `parent_id` cascade. RLS and the explicit filters both enforce ownership,
 * page identity, and the live-page guard.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { pageId, commentId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("page_comments")
    .delete()
    .eq("id", commentId)
    .eq("page_id", pageId)
    .eq("author_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/pages/:id/comments/:cid] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("commentNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
