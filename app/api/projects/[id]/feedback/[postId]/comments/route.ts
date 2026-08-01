import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { addCommentToFeedbackPost } from "@/lib/server/add-comment";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { getServiceClient } from "@/lib/supabase-service";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import {
  mentionsNumo,
  replyTargetsNumoFeedback,
  runFeedbackCommentMention,
} from "@/lib/server/assistant/comment-agent";

// @Numo replies run in after() once the response is sent — same window as the
// issue/objective comment routes so the agent loop isn't cut mid-flight.
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string; postId: string }> };

// Server-side bounds (the composer already caps client-side): comment body,
// number of @mentions, uuid-sized ids. Attachments are bounded downstream by
// parseAttachmentsInput.
const COMMENT_BODY_MAX = 10_000;
const MAX_MENTIONS = 50;

/** GET — the feedback post's internal comment thread. Service-role read gated by
    project membership: feedback stays RLS deny-all, so these team-only comments
    are read through the service client (never RLS), like the rest of the
    feedback team channel. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("comments")
    .select("*, attachments(*)")
    .eq("feedback_post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/feedback/:id/comments] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const keyActors = await resolveApiKeyActors(
    (data ?? []).map((c) => c.api_key_id as string | null)
  );
  return NextResponse.json(
    (data ?? []).map((comment) => ({
      ...comment,
      api_key_name: keyActors.get(comment.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(comment.api_key_id as string)?.agent ?? null,
    }))
  );
}

/** POST — add an internal comment on the feedback post (author = caller). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  // The post must belong to the route's project (feedback stays deny-all).
  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const input = (body ?? {}) as {
    body?: unknown;
    mentioned_user_ids?: unknown;
    parent_id?: unknown;
    attachments?: unknown;
  };

  const commentBody =
    typeof input.body === "string" ? input.body.slice(0, COMMENT_BODY_MAX) : "";
  const result = await addCommentToFeedbackPost({
    postId,
    actorId: guard.userId,
    body: commentBody,
    parentId:
      typeof input.parent_id === "string" ? input.parent_id.slice(0, 64) : null,
    mentionedUserIds: Array.isArray(input.mentioned_user_ids)
      ? input.mentioned_user_ids
          .filter((v): v is string => typeof v === "string")
          .slice(0, MAX_MENTIONS)
      : [],
    attachments: input.attachments,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }

  // @Numo → fire-and-forget agent reply, after the response is sent. Triggers:
  // an explicit @numo mention, or a reply posted right under a Numo comment.
  const service = getServiceClient();
  const created = result.comment as {
    id: string;
    feedback_post_id: string;
    parent_id: string | null;
  };
  const trigger = mentionsNumo(commentBody)
    ? "mention"
    : (await replyTargetsNumoFeedback(service, created))
      ? "reply"
      : null;
  if (trigger) {
    const locale = await getLocale();
    const { supabase } = guard;
    after(() =>
      runFeedbackCommentMention({
        supabase,
        service,
        postId,
        actorId: guard.userId,
        triggerCommentId: created.id,
        locale,
        trigger,
      })
    );
  }

  return NextResponse.json(result.comment, { status: 201 });
}
