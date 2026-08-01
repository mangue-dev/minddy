import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  authenticateIntegration,
  publicApiError,
  requireIntegrationKind,
} from "@/lib/server/integration-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { upsertFeedbackUser } from "@/lib/server/feedback/identity";
import { votePost } from "@/lib/server/feedback/votes";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/feedback/[id]/vote — vote au nom d'un utilisateur final
 * (Bearer mdy_…). Même contrat d'identité que POST /api/v1/feedback : le
 * serveur du client se porte garant (external_id et/ou email). 1 identité =
 * 1 voix — revoter est idempotent. Un post mergé ne se vote pas : voter le
 * canonique à la place (son id est retourné dans l'erreur).
 */
// Bornes d'identité (MIN-118) — mêmes plafonds que POST /api/v1/feedback :
// 254 = RFC 5321 pour l'email, external_id et name restent courts.
const USER_EXTERNAL_ID_MAX = 255;
const USER_EMAIL_MAX = 254;
const USER_NAME_MAX = 200;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateIntegration(request);
  if (!auth.ok) return auth.response;
  const wrongKind = requireIntegrationKind(auth.integration, "feedback");
  if (wrongKind) return wrongKind;

  const rate = checkSessionRateLimit(auth.integration.id, "integration:feedback:vote", {
    limit: 60,
  });
  if (!rate.allowed) {
    return publicApiError(429, "rate_limited", "Too many requests.", {
      "Retry-After": String(rate.retryAfter),
    });
  }

  let body: Record<string, unknown>;
  try {
    // Un corps non-objet (`null`, chaîne, tableau) est du JSON valide : refusé
    // ici plutôt que de crasher sur un accès de champ plus bas.
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return publicApiError(400, "invalid_json", "Request body must be a JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return publicApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const userInput = body.user;
  if (!userInput || typeof userInput !== "object" || Array.isArray(userInput)) {
    return publicApiError(
      422,
      "user_required",
      "user is required: votes are never anonymous. Provide user.external_id and/or user.email."
    );
  }
  const { external_id, email, name } = userInput as Record<string, unknown>;
  const externalId = typeof external_id === "string" ? external_id.trim() : "";
  const userEmail = typeof email === "string" ? email.trim() : "";
  const userName = typeof name === "string" ? name.trim() : "";
  if (!externalId && !userEmail) {
    return publicApiError(
      422,
      "user_identity_required",
      "user.external_id and/or user.email is required."
    );
  }
  if (externalId.length > USER_EXTERNAL_ID_MAX) {
    return publicApiError(
      422,
      "external_id_too_long",
      `user.external_id must be at most ${USER_EXTERNAL_ID_MAX} characters.`
    );
  }
  if (userEmail && (userEmail.length > USER_EMAIL_MAX || !userEmail.includes("@"))) {
    return publicApiError(422, "invalid_email", "user.email must be a valid email address.");
  }
  if (userName.length > USER_NAME_MAX) {
    return publicApiError(
      422,
      "name_too_long",
      `user.name must be at most ${USER_NAME_MAX} characters.`
    );
  }

  const { id } = await params;
  const service = getServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("id, project_id, merged_into_id, vote_count")
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (!post || post.project_id !== auth.project.id) {
    return publicApiError(404, "not_found", "Unknown feedback post.");
  }
  if (post.merged_into_id !== null) {
    return publicApiError(
      409,
      "post_merged",
      `This post was merged. Vote on the canonical post instead: ${post.merged_into_id}.`
    );
  }

  const feedbackUser = await upsertFeedbackUser({
    projectId: auth.project.id,
    externalId: externalId || null,
    email: userEmail || null,
    name: userName || null,
    verifiedVia: "api",
  });
  if (!feedbackUser) {
    return publicApiError(500, "internal_error", "Something went wrong.");
  }

  const voted = await votePost({ postId: post.id as string, userId: feedbackUser.id });
  if (!voted) {
    return publicApiError(500, "internal_error", "Something went wrong.");
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
