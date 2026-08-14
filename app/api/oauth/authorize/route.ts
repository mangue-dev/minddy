import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  buildCallbackUrl,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from "@/lib/server/oauth/authorize-validation";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import { ensureGrantWithActorKey } from "@/lib/server/oauth/grants";
import { createAuthorizationCode } from "@/lib/server/oauth/codes";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Décision de consentement (POST du formulaire /oauth/authorize). Session
 * requise + garde CSRF (Origin same-host) ; les champs cachés sont re-validés
 * INTÉGRALEMENT depuis la DB — un formulaire se falsifie. Approve → grant
 * (+ ligne api_keys acteur) + code à usage unique → 303 vers le client.
 */

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // CSRF : le POST vient de notre propre page — même host obligatoire.
  const originHeader = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameHost = (() => {
    if (!originHeader) return false;
    try {
      return new URL(originHeader).host === request.nextUrl.host;
    } catch {
      return false;
    }
  })();
  if (!sameHost || (fetchSite && fetchSite !== "same-origin")) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Cross-origin form post rejected." },
      { status: 403, headers: NO_STORE }
    );
  }

  const rate = checkSessionRateLimit(auth.user.id, "oauth:authorize", { limit: 30 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Rate limit exceeded." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rate.retryAfter) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Expected form data." },
      { status: 400, headers: NO_STORE }
    );
  }
  const field = (name: string): string | undefined => {
    const v = form.get(name);
    return typeof v === "string" ? v : undefined;
  };
  const params: AuthorizeParams = {
    client_id: field("client_id"),
    redirect_uri: field("redirect_uri"),
    response_type: "code",
    code_challenge: field("code_challenge"),
    code_challenge_method: field("code_challenge_method"),
    scope: field("scope"),
    state: field("state"),
    resource: field("resource"),
  };

  const validation = await validateAuthorizeRequest(params, oauthIssuer());
  if (validation.kind === "invalid") {
    // Formulaire falsifié, ou paramètre de protocole hors gabarit : on répond
    // ici. Aucune erreur ne part vers le client — voir authorize-validation.
    return NextResponse.json(
      { error: "invalid_request", error_description: validation.reason },
      { status: 400, headers: NO_STORE }
    );
  }

  const { client, redirectUri, codeChallenge, scope, resource, state } = validation;

  if (field("decision") !== "approve") {
    return NextResponse.redirect(
      buildCallbackUrl(redirectUri, { error: "access_denied", state }),
      { status: 303, headers: NO_STORE }
    );
  }

  const grant = await ensureGrantWithActorKey({ userId: auth.user.id, client });
  if (!grant) {
    return NextResponse.redirect(
      buildCallbackUrl(redirectUri, { error: "server_error", state }),
      { status: 303, headers: NO_STORE }
    );
  }
  const code = await createAuthorizationCode({
    clientId: client.client_id,
    userId: auth.user.id,
    grantId: grant.grantId,
    redirectUri,
    codeChallenge,
    scope,
    resource,
  });
  if (!code) {
    return NextResponse.redirect(
      buildCallbackUrl(redirectUri, { error: "server_error", state }),
      { status: 303, headers: NO_STORE }
    );
  }

  // Interstitiel « connexion réussie » (design minddy) : il valide le
  // `continue` contre les redirect_uris du client puis redirige vers le
  // callback qui porte le code.
  const successUrl = new URL("/oauth/success", request.nextUrl.origin);
  successUrl.searchParams.set("client_id", client.client_id);
  successUrl.searchParams.set("continue", buildCallbackUrl(redirectUri, { code, state }));
  return NextResponse.redirect(successUrl, { status: 303, headers: NO_STORE });
}
