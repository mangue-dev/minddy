import "server-only";

import { getClient, type OAuthClient } from "@/lib/server/oauth/clients";

/**
 * Validation de la requête d'autorisation (RFC 6749 §4.1.1 + PKCE), partagée
 * entre la page de consentement (GET) et la route de décision (POST — qui
 * re-valide tout : les champs cachés d'un formulaire ne sont pas fiables).
 *
 * Deux familles d'échec :
 * - "fatal" (client inconnu, redirect_uri non enregistré) → afficher une
 *   erreur, NE JAMAIS rediriger (anti open-redirect) ;
 * - "error_redirect" (erreur protocolaire) → rediriger vers le redirect_uri
 *   validé avec ?error=…&state=… (RFC 6749 §4.1.2.1).
 */

// base64url(sha256) = 43 caractères ; la RFC borne 43-128.
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export type AuthorizeParams = Partial<
  Record<
    | "client_id"
    | "redirect_uri"
    | "response_type"
    | "code_challenge"
    | "code_challenge_method"
    | "scope"
    | "state"
    | "resource",
    string
  >
>;

export type AuthorizeValidation =
  | { kind: "fatal"; reason: "unknown_client" | "invalid_redirect_uri" }
  | {
      kind: "error_redirect";
      redirectUri: string;
      state: string | null;
      error: string;
      errorDescription: string;
    }
  | {
      kind: "ok";
      client: OAuthClient;
      redirectUri: string;
      codeChallenge: string;
      scope: string;
      resource: string | null;
      state: string | null;
    };

/** URL MCP canonique attendue en `resource` (RFC 8707) — comparaison après
    canonisation légère (host insensible à la casse, slash final toléré). */
export function isValidResource(resource: string, origin: string): boolean {
  try {
    const parsed = new URL(resource);
    const expected = new URL(`${origin}/api/mcp`);
    return (
      parsed.protocol === expected.protocol &&
      parsed.host.toLowerCase() === expected.host.toLowerCase() &&
      parsed.pathname.replace(/\/$/, "") === expected.pathname &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

export async function validateAuthorizeRequest(
  params: AuthorizeParams,
  origin: string
): Promise<AuthorizeValidation> {
  const client = await getClient(params.client_id);
  if (!client) return { kind: "fatal", reason: "unknown_client" };

  const redirectUri = params.redirect_uri;
  // Comparaison STRICTE avec les URIs enregistrées — aucune normalisation.
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return { kind: "fatal", reason: "invalid_redirect_uri" };
  }

  const state = params.state ?? null;
  const err = (error: string, errorDescription: string): AuthorizeValidation => ({
    kind: "error_redirect",
    redirectUri,
    state,
    error,
    errorDescription,
  });

  if (params.response_type !== "code") {
    return err("unsupported_response_type", "Only response_type=code is supported.");
  }
  if (params.code_challenge_method && params.code_challenge_method !== "S256") {
    return err("invalid_request", "Only the S256 code_challenge_method is supported.");
  }
  if (!params.code_challenge || !CHALLENGE_RE.test(params.code_challenge)) {
    return err("invalid_request", "A valid S256 code_challenge is required (PKCE).");
  }
  if (params.scope !== undefined && params.scope !== "" && params.scope !== "minddy") {
    return err("invalid_scope", "Only the 'minddy' scope is supported.");
  }
  if (params.resource !== undefined && !isValidResource(params.resource, origin)) {
    return err(
      "invalid_target",
      `The resource parameter must be ${origin}/api/mcp.`
    );
  }

  return {
    kind: "ok",
    client,
    redirectUri,
    codeChallenge: params.code_challenge,
    scope: "minddy",
    resource: params.resource ?? null,
    state,
  };
}

/** redirect_uri + paramètres ajoutés (code/erreur + state réécho verbatim). */
export function buildCallbackUrl(
  redirectUri: string,
  params: Record<string, string | null>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}
