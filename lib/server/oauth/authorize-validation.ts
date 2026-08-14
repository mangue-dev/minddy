import "server-only";

import { getClient, type OAuthClient } from "@/lib/server/oauth/clients";

/**
 * Validation de la requête d'autorisation (RFC 6749 §4.1.1 + PKCE), partagée
 * entre la page de consentement (GET) et la route de décision (POST — qui
 * re-valide tout : les champs cachés d'un formulaire ne sont pas fiables).
 *
 * Un seul verdict d'échec, et il ne redirige JAMAIS. La RFC autorise à
 * renvoyer une erreur protocolaire au `redirect_uri` une fois celui-ci
 * reconnu (§4.1.2.1) ; ici l'enregistrement dynamique de client est ouvert à
 * tous, donc « URI enregistrée » ne veut rien dire de plus que « URI qu'un
 * inconnu a déposée ». Rendre la redirection sur un paramètre invalide, c'est
 * offrir un redirecteur ouvert permanent sous notre domaine, déclenchable par
 * une simple URL — `?response_type=x` suffit. Une erreur de protocole se rend
 * donc sur notre propre page.
 *
 * Reste une seule redirection vers le client, après validation COMPLÈTE : la
 * décision de l'utilisateur (`code`, ou `error=access_denied` s'il refuse).
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

/** Motifs d'échec, tels qu'ils s'affichent : chacun a sa phrase sur la page
    d'erreur (namespace i18n `OAuthConsent`). */
export type AuthorizeFailure =
  | "unknown_client"
  | "invalid_redirect_uri"
  | "unsupported_response_type"
  | "invalid_code_challenge"
  | "invalid_scope"
  | "invalid_resource";

export type AuthorizeValidation =
  | { kind: "invalid"; reason: AuthorizeFailure }
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
  if (!client) return { kind: "invalid", reason: "unknown_client" };

  const redirectUri = params.redirect_uri;
  // Comparaison STRICTE avec les URIs enregistrées — aucune normalisation.
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return { kind: "invalid", reason: "invalid_redirect_uri" };
  }

  const err = (reason: AuthorizeFailure): AuthorizeValidation => ({
    kind: "invalid",
    reason,
  });

  if (params.response_type !== "code") return err("unsupported_response_type");
  if (params.code_challenge_method && params.code_challenge_method !== "S256") {
    return err("invalid_code_challenge");
  }
  if (!params.code_challenge || !CHALLENGE_RE.test(params.code_challenge)) {
    return err("invalid_code_challenge");
  }
  if (params.scope !== undefined && params.scope !== "" && params.scope !== "minddy") {
    return err("invalid_scope");
  }
  if (params.resource !== undefined && !isValidResource(params.resource, origin)) {
    return err("invalid_resource");
  }

  return {
    kind: "ok",
    client,
    redirectUri,
    codeChallenge: params.code_challenge,
    scope: "minddy",
    resource: params.resource ?? null,
    state: params.state ?? null,
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
