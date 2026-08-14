import "server-only";

import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * Issuer du serveur d'autorisation (RFC 8414) — et par ricochet la base du
 * `resource` RFC 8707, des endpoints publiés, et de l'origine contre laquelle
 * on valide les paramètres de la requête d'autorisation.
 *
 * Il se dérive de l'ENVIRONNEMENT, jamais d'un en-tête de requête. Un issuer
 * lu dans `x-forwarded-host` est une valeur que l'appelant choisit : il suffit
 * de récupérer les métadonnées avec l'en-tête voulu pour se faire annoncer un
 * `authorization_endpoint` et un `token_endpoint` chez soi, sous notre nom.
 *
 * `OAUTH_ISSUER` d'abord — l'échappatoire explicite (tunnel de dev, domaine
 * d'essai) —, puis l'origine canonique de l'app
 * ([app-origin.ts](../app-origin.ts)), qui porte les trois autres cas et sert
 * aussi aux liens d'invitation : c'est la même question, « quelle adresse est
 * la nôtre », et elle mérite une seule réponse.
 */
export function oauthIssuer(): string {
  const explicit = process.env.OAUTH_ISSUER?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      console.error("[oauth/issuer] OAUTH_ISSUER is not a valid URL — ignored.");
    }
  }

  return canonicalAppOrigin();
}

/** URL canonique de la ressource MCP protégée (RFC 8707 / 9728). */
export function mcpResourceUrl(): string {
  return `${oauthIssuer()}/api/mcp`;
}
