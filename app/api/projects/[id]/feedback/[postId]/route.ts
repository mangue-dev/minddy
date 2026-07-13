import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";
import { getTeamFeedbackDetail } from "@/lib/server/feedback/team-queries";
import { FEEDBACK_TITLE_MAX, FEEDBACK_BODY_MAX } from "@/lib/server/feedback/posts";
import { emitFeedbackFieldChanges } from "@/lib/server/feedback/events";
import { isFeedbackPostStatus } from "@/lib/feedback/types";

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

  const updates: Record<string, unknown> = {};
  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: t("titleRequired") }, { status: 400 });
    updates.title = title.slice(0, FEEDBACK_TITLE_MAX);
  }
  if ("body" in body) {
    if (typeof body.body !== "string") {
      return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
    }
    updates.body = body.body.slice(0, FEEDBACK_BODY_MAX);
  }
  if ("status" in body) {
    if (!isFeedbackPostStatus(body.status)) {
      return NextResponse.json({ error: t("invalidStatus") }, { status: 400 });
    }
    updates.status = body.status;
  }
  if ("team_response" in body) {
    const response =
      typeof body.team_response === "string" ? body.team_response.trim() : "";
    updates.team_response = response || null;
    updates.team_response_at = response ? new Date().toISOString() : null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t("noFieldsToUpdate") }, { status: 400 });
  }

  const service = getServiceClient();
  const { error } = await service.from("feedback_posts").update(updates).eq("id", postId);
  if (error) {
    console.error("[feedback] patch failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  // Journal d'activité : diff des champs édités, attribué au membre.
  await emitFeedbackFieldChanges(service, {
    postId,
    actorId: guard.userId,
    before: post as unknown as Record<string, unknown>,
    updates,
  });
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

  const service = getServiceClient();
  const { error } = await service.from("feedback_posts").delete().eq("id", postId);
  if (error) {
    console.error("[feedback] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
