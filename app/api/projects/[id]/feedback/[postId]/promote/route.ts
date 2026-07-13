import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { promoteFeedbackPost } from "@/lib/server/feedback/promote";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** POST — promotion en issue : crée une issue liée (backlog) dont la
    description embarque le retour et son compteur de votes. */
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

  const result = await promoteFeedbackPost({
    postId,
    actorId: guard.userId,
    projectName: guard.access.project.name,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true, issue: result.issue }, { status: 201 });
}
