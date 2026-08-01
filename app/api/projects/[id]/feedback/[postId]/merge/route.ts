import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { mergePosts } from "@/lib/server/feedback/merge";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** POST { canonical_id } — fusion manuelle 1-clic : CE post devient le doublon
    du canonique (votes unis par identité, redirect). */
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
  // `null` est du JSON valide : lire body.canonical_id dessus ferait un 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  // Un uuid fait 36 caractères — au-delà de 64, ce n'est pas un id.
  const canonicalId =
    typeof body.canonical_id === "string" && body.canonical_id.length <= 64
      ? body.canonical_id
      : "";
  if (!canonicalId) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const [dup, canonical] = await Promise.all([
    getProjectFeedbackPost(id, postId),
    getProjectFeedbackPost(id, canonicalId),
  ]);
  if (!dup || !canonical) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const result = await mergePosts({
    dupId: postId,
    canonicalId,
    performedBy: "team",
    actorId: guard.userId,
  });
  if (!result.ok) {
    console.error("[feedback] merge failed:", result.error);
    return NextResponse.json({ error: t("feedbackMergeFailed") }, { status: 409 });
  }
  return NextResponse.json({ ok: true, event_id: result.eventId });
}
