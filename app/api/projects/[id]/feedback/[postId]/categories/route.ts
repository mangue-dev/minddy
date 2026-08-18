import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { setFeedbackPostCategories } from "@/lib/server/feedback/set-post-categories";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

// Ceiling of game sent — well beyond an actual board, but limits the request
// `.in(...)` base side. The ids are uuids: 64 characters are enough.
const MAX_CATEGORY_IDS = 100;

/** PUT /api/projects/[id]/feedback/[postId]/categories { category_ids }
 — replaces the post's category set (MIN-52). Project member required. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

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
  const raw = (body as { category_ids?: unknown })?.category_ids;
  const requested = Array.isArray(raw)
    ? raw
        .filter((v): v is string => typeof v === "string" && v.length <= 64)
        .slice(0, MAX_CATEGORY_IDS)
    : [];

  const result = await setFeedbackPostCategories({
    projectId: id,
    postId,
    categoryIds: requested,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ category_ids: result.categoryIds });
}
