import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { removeStorageObjects } from "@/lib/server/attachments";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { guardFeedbackComment } from "@/lib/server/feedback/comment-guard";

type RouteContext = {
  params: Promise<{ id: string; postId: string; commentId: string }>;
};

// Same server-side bound as the comment-creation route (the composer already
// caps client-side).
const COMMENT_BODY_MAX = 10_000;

/**
 * Edit / delete a feedback comment. Feedback is RLS deny-all, so (unlike
 * issue/objective comments, which go through /api/comments/[id] on the RLS
 * client) these run on the service client, gated by project membership.
 *
 * Qui a le droit de quoi vit dans `lib/server/feedback/comment-guard.ts` — c'est
 * une règle de permission, elle mérite d'être exerçable ailleurs que par une
 * requête HTTP.
 */

/** PATCH — edit the comment body (author-only, own non-Numo comment). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, postId, commentId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const text =
    typeof (body as { body?: unknown })?.body === "string"
      ? ((body as { body: string }).body).trim().slice(0, COMMENT_BODY_MAX)
      : "";
  if (!text) return NextResponse.json({ error: t("commentEmpty") }, { status: 400 });

  const service = getServiceClient();
  const own = await guardFeedbackComment(service, {
    postId,
    commentId,
    userId: guard.userId,
    mode: "edit",
  });
  if (!own.ok) {
    return NextResponse.json({ error: t("commentNotFound") }, { status: own.status });
  }

  const { data, error } = await service
    .from("comments")
    .update({ body: text })
    .eq("id", commentId)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[api/feedback/comments/:id] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** DELETE — remove the comment: one's own, or ANY public comment on the board,
    whoever wrote it (moderation). Deleting a thread root cascades its replies
    (parent_id FK), whose attachment objects are cleaned up here. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id, postId, commentId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });

  const service = getServiceClient();
  const own = await guardFeedbackComment(service, {
    postId,
    commentId,
    userId: guard.userId,
    mode: "delete",
  });
  if (!own.ok) {
    return NextResponse.json({ error: t("commentNotFound") }, { status: own.status });
  }

  // Snapshot storage paths first — the root's replies cascade with it. Une
  // ressource LIEN n'a pas d'objet (`storage_path` nul, MIN-184) : l'écarter
  // ici, sinon la liste porterait un null que `storage.remove()` refuse EN
  // BLOC — un seul lien sur le fil, et plus aucun fichier ne serait effacé.
  const { data: replies } = await service
    .from("comments")
    .select("id")
    .eq("parent_id", commentId);
  const commentIds = [commentId, ...(replies ?? []).map((r) => r.id as string)];
  const { data: attachmentRows } = await service
    .from("attachments")
    .select("storage_path")
    .in("comment_id", commentIds)
    .not("storage_path", "is", null);

  const { error } = await service.from("comments").delete().eq("id", commentId);
  if (error) {
    console.error("[api/feedback/comments/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  await removeStorageObjects(
    service,
    (attachmentRows ?? []).map((a) => a.storage_path as string)
  );
  return NextResponse.json({ ok: true });
}
