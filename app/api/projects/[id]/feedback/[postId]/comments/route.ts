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
import {
  isCommentVisibility,
  type CommentVisibility,
} from "@/lib/feedback/types";

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

/** GET — the feedback post's comment thread, internal AND public (MIN-196), in
    one chronological list: for the team they are the same conversation, and the
    `visibility` field is what the timeline paints a badge from.

    Service-role read gated by project membership: feedback stays RLS deny-all,
    so these are read through the service client (never RLS), like the rest of
    the feedback team channel.

    A public comment written by a VISITOR carries their real identity here —
    name and email — and only here. That identity is the whole reason signing in
    is required to comment: the team must be able to moderate. The board itself
    never sees more than a pseudonym-seeded avatar. */
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
    .select("*, attachments(*), feedback_users!feedback_user_id (id, name, email, pseudonym)")
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

/** POST — add a comment on the feedback post (author = caller). `visibility`
    picks the side: `internal` (the default) stays team-only, `public` publishes
    it on the board as the team's voice — that is how a team response is written
    since MIN-196. */
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
    visibility?: unknown;
  };

  const visibility: CommentVisibility = isCommentVisibility(input.visibility)
    ? input.visibility
    : "internal";
  const commentBody =
    typeof input.body === "string" ? input.body.slice(0, COMMENT_BODY_MAX) : "";
  const result = await addCommentToFeedbackPost({
    postId,
    actorId: guard.userId,
    visibility,
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
  //
  // Never on a PUBLIC comment (MIN-196): what is written there is read by
  // visitors on the board, and an agent answering in that thread would be
  // speaking to them, as the team, without anyone having asked. A "@numo" typed
  // in a public reply is text — the board prints it and nothing more.
  const service = getServiceClient();
  const created = result.comment as {
    id: string;
    feedback_post_id: string;
    parent_id: string | null;
    visibility: string;
  };
  // The visibility we read here is that of the CREATED LINE, not the one we have
  // requested: a response inherits the visibility of its thread, and a response
  // under a public comment is therefore public even if the composer sent
  // " internal ". Rereading the request would let Numo respond on the board.
  const trigger =
    created.visibility === "public"
      ? null
      : mentionsNumo(commentBody)
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
