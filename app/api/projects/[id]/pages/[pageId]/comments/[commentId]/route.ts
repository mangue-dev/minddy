import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; commentId: string }>;
};

/** Même plafond que l'écriture (lib/server/page-comments.ts). */
const MAX_COMMENT_LENGTH = 65_536;

/**
 * PATCH — corriger son propre commentaire (MIN-282).
 *
 * Client de SESSION, comme /api/comments/[id] : la règle « seul l'auteur
 * réécrit » n'est pas ici, elle est dans la policy. Une écriture d'un autre ne
 * lève pas, elle ne touche AUCUNE ligne — d'où le 404, qui est aussi le signal
 * que donne l'invisibilité RLS.
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
    // L'auteur, en plus de la policy (`page_comments_update`, resserrée sur lui
    // en 20261208090000) : la règle vaut quel que soit le chemin, et le filtre
    // ici est ce qui la rend lisible depuis la route.
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

/** DELETE — retirer son propre commentaire ; une racine emporte ses réponses
    (cascade `parent_id`). L'auteur seul — par la policy ET par le filtre, comme
    le `PATCH` juste au-dessus : il ne l'avait pas, et la règle ne se lisait donc
    que dans la migration (MIN-351). */
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
