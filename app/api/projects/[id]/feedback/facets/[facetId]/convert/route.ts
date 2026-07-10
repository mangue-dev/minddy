import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackFacet,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { convertFacetToPost } from "@/lib/server/feedback/facets";

type RouteContext = { params: Promise<{ id: string; facetId: string }> };

/** POST — conversion facette → post : le remède quand un « détail » a du sens
    seul (racine déguisée). Les voteurs de la facette suivent. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, facetId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const facet = await getProjectFeedbackFacet(id, facetId);
  if (!facet) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const result = await convertFacetToPost({ facetId, actorId: guard.userId });
  if (!result.ok) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, post_id: result.postId }, { status: 201 });
}
