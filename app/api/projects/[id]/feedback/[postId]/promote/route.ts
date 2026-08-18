import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { promoteFeedbackPost } from "@/lib/server/feedback/promote";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** POST — issue promotion: creates a linked issue whose description embeds
 the return and its vote counter. The body is OPTIONAL: the fields
 that the human filled in the creation form (effort, priority, assigned
, status…) take precedence over the default values; without a body, the
 promotion remains the one before, a ticket in the backlog. */
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

  // A missing or illegible body is not an error: it is promotion
  // “as is”, the one that Numo and historical calls send.
  const body = (await request.json().catch(() => null)) as unknown;
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;

  const result = await promoteFeedbackPost({
    postId,
    actorId: guard.userId,
    projectName: guard.access.project.name,
    input,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true, issue: result.issue }, { status: 201 });
}
