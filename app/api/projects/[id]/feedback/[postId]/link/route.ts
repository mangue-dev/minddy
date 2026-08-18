import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { linkFeedbackIssue, unlinkFeedbackIssue } from "@/lib/server/feedback/promote";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** POST { issue_id } — links the post to an existing project issue (the counterpart
 of the promotion when the work is already tracked). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }
  if (post.issue_id) {
    return NextResponse.json({ error: t("feedbackAlreadyPromoted") }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // `null` is valid JSON: reading body.issue_id on it would make a 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  // A uuid is 36 characters long — beyond 64, it is not an id.
  const issueId =
    typeof body.issue_id === "string" && body.issue_id.length <= 64
      ? body.issue_id
      : "";
  if (!issueId) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const result = await linkFeedbackIssue({ postId, issueId, actorId: guard.userId });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE — unbinds the issue (the post keeps its last public status). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post || !post.issue_id) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const ok = await unlinkFeedbackIssue(postId, guard.userId);
  if (!ok) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
