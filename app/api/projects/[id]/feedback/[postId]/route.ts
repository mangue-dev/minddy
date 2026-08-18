import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { softDeleteItem } from "@/lib/server/trash";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { getTeamFeedbackDetail } from "@/lib/server/feedback/team-queries";
import { updateFeedbackPostFields } from "@/lib/server/feedback/posts";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** GET — team detail; PATCH — editing the canonical layer (title, body,
 manual status, team response — never submitted_*); DELETE. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const detail = await getTeamFeedbackDetail(id, postId);
  if (!detail) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }
  return NextResponse.json({ post: detail });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // `null` is valid JSON: `"title" in body` on it would be a 500, not a 400.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  // Editing the canonical layer (title/body/status/response) + activity:
  // core shared with the Numo respond_to_feedback tool.
  const result = await updateFeedbackPostFields({
    postId,
    actorId: guard.userId,
    input: body,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }

  const detail = await getTeamFeedbackDetail(id, postId);
  return NextResponse.json({ post: detail });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  // Trash, not destruction (MIN-133): the post leaves the public board and the
  // team view by the `deleted_at` filter of feedback readings, but its votes,
  // his comments and his original text remain recoverable for 30 days.
  const result = await softDeleteItem("feedback", postId, guard.userId);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
