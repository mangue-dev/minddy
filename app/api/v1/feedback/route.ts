import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateIntegration,
  publicApiError,
  requireIntegrationKind,
} from "@/lib/server/integration-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { readAnalyzeOption } from "@/lib/feedback/analyze-option";
import { upsertFeedbackUser } from "@/lib/server/feedback/identity";
import {
  createFeedbackPost,
  FEEDBACK_TITLE_MAX,
  FEEDBACK_BODY_MAX,
} from "@/lib/server/feedback/posts";

/**
 * POST /api/v1/feedback — API publique d'intégration (Bearer mdy_…, mêmes clés
 * que /api/v1/issues qui reste la création directe d'issues). Dépose un post de
 * feedback au nom d'un utilisateur final : le serveur du client se porte
 * garant de l'identité transmise (jamais d'anonyme — external_id et/ou email
 * requis). Le post entre dans le pipeline standard (embedding à la soumission,
 * dédup IA horaire) et apparaît sur le board public s'il est activé.
 *
 * Payload : { title, body?, user: { external_id?, email?, name? }, analyze? }
 *
 * `analyze` (MIN-106, défaut true) : passer false garde le post hors de la passe
 * de revue de Numo — pour un client qui fait tourner son propre classifier. Le
 * post est alors publié tel quel, sans modération, sans catégories et sans
 * fusion automatique (c'est un seul appel qui fait les trois).
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request);
  if (!auth.ok) return auth.response;
  const wrongKind = requireIntegrationKind(auth.integration, "feedback");
  if (wrongKind) return wrongKind;

  const rate = checkSessionRateLimit(auth.integration.id, "integration:feedback:post", {
    limit: 20,
  });
  if (!rate.allowed) {
    return publicApiError(429, "rate_limited", "Too many requests.", {
      "Retry-After": String(rate.retryAfter),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return publicApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return publicApiError(422, "title_required", "A non-empty title is required.");
  }
  if (title.length > FEEDBACK_TITLE_MAX) {
    return publicApiError(
      422,
      "title_too_long",
      `title must be at most ${FEEDBACK_TITLE_MAX} characters.`
    );
  }
  if (body.body !== undefined && typeof body.body !== "string") {
    return publicApiError(422, "invalid_body", "body must be a string.");
  }
  if (typeof body.body === "string" && body.body.length > FEEDBACK_BODY_MAX) {
    return publicApiError(
      422,
      "body_too_long",
      `body must be at most ${FEEDBACK_BODY_MAX} characters.`
    );
  }

  // Opt-out de la revue Numo (MIN-106), pour un client qui classe lui-même.
  const analyzeOption = readAnalyzeOption(body.analyze);
  if (!analyzeOption.ok) {
    return publicApiError(
      422,
      "invalid_analyze",
      "analyze must be a boolean (true to let minddy's AI review the post, false to keep it out). Defaults to true."
    );
  }

  const userInput = body.user;
  if (!userInput || typeof userInput !== "object" || Array.isArray(userInput)) {
    return publicApiError(
      422,
      "user_required",
      "user is required: feedback is never anonymous. Provide user.external_id and/or user.email."
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
  if (userEmail && !userEmail.includes("@")) {
    return publicApiError(422, "invalid_email", "user.email must be a valid email address.");
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

  const result = await createFeedbackPost({
    projectId: auth.project.id,
    title,
    body: typeof body.body === "string" ? body.body : "",
    source: "api",
    authorId: feedbackUser.id,
    integrationId: auth.integration.id,
    analyze: analyzeOption.analyze,
  });
  if (!result.ok) {
    console.error("[api/v1/feedback] create failed:", result.errorKey);
    return publicApiError(500, "internal_error", "Something went wrong.");
  }

  return NextResponse.json(
    {
      id: result.post.id,
      title: result.post.title,
      status: result.post.status,
      // Conséquence observable d'`analyze` : 'published' = déjà sur le board,
      // 'pending' = retenu le temps de la revue. C'est ce qui dit à
      // l'intégrateur que son drapeau a bien été pris en compte.
      review_state: result.post.review_state,
      votes: result.post.vote_count,
      user: { pseudonym: feedbackUser.pseudonym },
    },
    { status: 201 }
  );
}
