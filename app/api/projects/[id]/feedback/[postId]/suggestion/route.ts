import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { mergePosts, rejectMergeSuggestion } from "@/lib/server/feedback/merge";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** POST { action: "accept" | "reject" } — traite la suggestion IA du post :
    accept = merge (undoable), reject = mémorisé pour toujours (anti-récidive). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const action = body.action;
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }
  if (!post.suggested_merge_into_id) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  if (action === "reject") {
    const ok = await rejectMergeSuggestion({ postId, actorId: guard.userId });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const result = await mergePosts({
    dupId: postId,
    canonicalId: post.suggested_merge_into_id,
    performedBy: "team",
    actorId: guard.userId,
    confidence: post.suggested_confidence,
  });
  if (!result.ok) {
    console.error("[feedback] suggestion accept failed:", result.error);
    return NextResponse.json({ error: t("feedbackMergeFailed") }, { status: 409 });
  }
  return NextResponse.json({ ok: true, event_id: result.eventId });
}
