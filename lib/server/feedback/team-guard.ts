import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  accessAllows,
  getProjectAccess,
  hasProjectAccess,
  type ProjectAccess,
  type ProjectCapability,
} from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";
import { feedbackPostStore } from "@/lib/server/feedback-post-store";

/**
 * Common guard of internal feedback API routes (MIN-37): session +
 * project membership (the standard mechanic getAuthedUser +
 * getProjectAccess), factored because around ten routes repeat it.
 */

export type TeamGuardResult =
  | { ok: true; userId: string; access: ProjectAccess; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * `capability` is what the route does (MIN-693): `read` for listings and
 * reads, `comment` for internal notes, `write` for moderation, promotion,
 * links and every other change. A reader who lacks it gets a 403.
 */
export async function requireProjectMember(
  request: NextRequest,
  projectId: string,
  capability: Exclude<ProjectCapability, "admin"> = "read"
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
  if (!accessAllows(access, capability)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: t(capability === "comment" ? "commentNotAllowed" : "readOnlyProject") },
        { status: 403 }
      ),
    };
  }
  // supabase = the caller's RLS client (still valid inside after()) — the
  // @Numo feedback agent reads through it, like the issue/objective routes.
  return { ok: true, userId: auth.user.id, access, supabase: auth.supabase };
}

export type FeedbackMemberResult =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * `requireProjectMember` for routes that never use the project itself: the
 * same membership decision without decoding the project. With `postId`, the
 * post must also be live in that project. Its presence is probed alongside the
 * access check without reading content, and a project denial still wins.
 */
export async function requireFeedbackMember(
  request: NextRequest,
  projectId: string,
  postId?: string
): Promise<FeedbackMemberResult> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  const [t, access, post] = await Promise.all([
    getTranslations("ApiErrors"),
    hasProjectAccess(auth.user.id, projectId),
    postId === undefined ? null : feedbackPostStore(getServiceClient())
      .select("id")
      .is("deleted_at", null)
      .eq("id", postId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: t("projectNotFound") }, { status: 404 }),
    };
  }
  if (post && !post.data) {
    return {
      ok: false,
      response: NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 }),
    };
  }
  return { ok: true, userId: auth.user.id, supabase: auth.supabase };
}

/** Load a post and check that it belongs to the road project. */
export async function getProjectFeedbackPost(
  projectId: string,
  postId: string
): Promise<FeedbackPostRow | null> {
  const service = getServiceClient();
  const { data } = await feedbackPostStore(service)
    .select(FEEDBACK_POST_SELECT)
    .is("deleted_at", null)
    .eq("id", postId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as FeedbackPostRow | null) ?? null;
}
