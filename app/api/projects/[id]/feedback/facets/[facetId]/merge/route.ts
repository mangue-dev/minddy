import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackFacet,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { mergeFacets } from "@/lib/server/feedback/merge";

type RouteContext = { params: Promise<{ id: string; facetId: string }> };

/** POST { canonical_id } — fusionne CETTE facette (doublon) dans une autre du
    même post : voix unies par identité, provenance copiée, undoable. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, facetId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const canonicalId = typeof body.canonical_id === "string" ? body.canonical_id : "";
  if (!canonicalId) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const [dup, canonical] = await Promise.all([
    getProjectFeedbackFacet(id, facetId),
    getProjectFeedbackFacet(id, canonicalId),
  ]);
  if (!dup || !canonical) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const result = await mergeFacets({
    dupId: facetId,
    canonicalId,
    performedBy: "team",
    actorId: guard.userId,
  });
  if (!result.ok) {
    console.error("[feedback] facet merge failed:", result.error);
    return NextResponse.json({ error: t("feedbackMergeFailed") }, { status: 409 });
  }
  return NextResponse.json({ ok: true, event_id: result.eventId });
}
