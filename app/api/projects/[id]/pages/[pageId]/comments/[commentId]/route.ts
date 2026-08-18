import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; commentId: string }>;
};

/** Same ceiling as writing (lib/server/page-comments.ts). */
const MAX_COMMENT_LENGTH = 65_536;

/**
 * PATCH — edit your own comment (MIN-282).
 *
 * SESSION client, like /api/comments/[id]: the "only author" rule
 * rewritten” is not here, it is in the policy. A writing of another
 * does not raise, it does not touch ANY line — hence the 404, which is also the signal
 * what does RLS invisibility give.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { commentId } = await params;
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
    // The author, in addition to the policy (`page_comments_update`, tightened on him
    // en 20261208090000): the rule is valid whatever the path, and the filter
    // here is what makes it readable from the road.
    .eq("id", commentId)
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

/** DELETE — remove your own comment; a root carries its answers
 (cascade `parent_id`). The author alone — by the policy AND by the filter, like
 the `PATCH` just above: he did not have it, and the rule therefore only read
 in the migration (MIN-351). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { commentId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("page_comments")
    .delete()
    .eq("id", commentId)
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
