import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  getProjectFeedbackFacet,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { deleteFacet, renameFacet } from "@/lib/server/feedback/facets";

type RouteContext = { params: Promise<{ id: string; facetId: string }> };

/** PATCH { text? , clear_flag? } — renommage de la couche canonique (jamais
    submitted_text) / levée du drapeau de review ; DELETE — suppression. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, facetId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const facet = await getProjectFeedbackFacet(id, facetId);
  if (!facet) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  if (typeof body.text === "string") {
    const renamed = await renameFacet({ facetId, text: body.text });
    if (!renamed) {
      return NextResponse.json({ error: t("titleRequired") }, { status: 400 });
    }
    return NextResponse.json({ facet: renamed });
  }
  if (body.clear_flag === true) {
    const service = getServiceClient();
    const { error } = await service
      .from("feedback_facets")
      .update({ review_flag: null })
      .eq("id", facetId);
    if (error) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: t("noFieldsToUpdate") }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id, facetId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const facet = await getProjectFeedbackFacet(id, facetId);
  if (!facet) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }
  const ok = await deleteFacet(facetId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: t("databaseError") }, { status: 500 });
}
