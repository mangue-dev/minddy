import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { removeStorageObjects } from "@/lib/server/attachments";
import { deleteCommentThreadAtomic } from "@/lib/server/comment-lifecycle";
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
 * Who has the right to what lives in `lib/server/feedback/comment-guard.ts` — it's
 * a rule of permission, it deserves to be exercised elsewhere than by a
 * HTTP request.
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

  let deleted;
  try {
    deleted = await deleteCommentThreadAtomic(service, commentId);
  } catch (error) {
    console.error("[api/feedback/comments/:id] delete failed:", (error as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (deleted.status === "not_found") {
    return NextResponse.json({ error: t("commentNotFound") }, { status: 404 });
  }

  await removeStorageObjects(service, deleted.storagePaths);
  return NextResponse.json({ ok: true });
}
