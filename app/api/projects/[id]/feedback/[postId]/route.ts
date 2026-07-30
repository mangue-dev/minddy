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

/** GET — détail équipe ; PATCH — édition de la couche canonique (titre, corps,
    statut manuel, réponse d'équipe — jamais submitted_*) ; DELETE. */
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

  // Édition de la couche canonique (titre/corps/statut/réponse) + activité :
  // core partagé avec l'outil Numo respond_to_feedback.
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

  // Corbeille, pas destruction (MIN-133) : le post sort du board public et de la
  // vue équipe par le filtre `deleted_at` des lectures feedback, mais ses votes,
  // ses commentaires et son texte d'origine restent 30 jours récupérables.
  const result = await softDeleteItem("feedback", postId, guard.userId);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
