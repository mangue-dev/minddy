import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";

/**
 * Garde commune des routes API internes du feedback (MIN-37) : session +
 * appartenance au projet (la mécanique standard getAuthedUser +
 * getProjectAccess), factorisée car une dizaine de routes la répètent.
 */

export type TeamGuardResult =
  | { ok: true; userId: string; access: ProjectAccess }
  | { ok: false; response: NextResponse };

export async function requireProjectMember(
  request: NextRequest,
  projectId: string
): Promise<TeamGuardResult> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  const t = await getTranslations("ApiErrors");
  const access = await getProjectAccess(auth.user.id, projectId);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: t("projectNotFound") }, { status: 404 }),
    };
  }
  return { ok: true, userId: auth.user.id, access };
}

/** Charge un post et vérifie qu'il appartient bien au projet de la route. */
export async function getProjectFeedbackPost(
  projectId: string,
  postId: string
): Promise<FeedbackPostRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select(FEEDBACK_POST_SELECT)
    .eq("id", postId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as FeedbackPostRow | null) ?? null;
}
