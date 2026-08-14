import "server-only";

import { SITE_URL } from "@/lib/site";

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
 * Trois cas, dans cet ordre :
 * - `OAUTH_ISSUER` — l'échappatoire explicite (tunnel de dev, domaine d'essai) ;
 * - production Vercel — le domaine canonique, quel que soit l'alias emprunté ;
 * - preview Vercel — l'URL du déploiement, pour qu'un preview s'authentifie
 *   contre lui-même ; poste de dev — le localhost du serveur.
 *
 * Volontairement PAS `NEXT_PUBLIC_APP_URL` : elle vaut le domaine de prod
 * jusque sur un preview (voir `lib/server/agent/origin.ts`), et un issuer qui
 * ne désigne pas le déploiement qui l'a servi casse la découverte.
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

  const vercelEnv = process.env.VERCEL_ENV?.trim();
  if (vercelEnv === "production") return SITE_URL;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return `http://localhost:${process.env.PORT?.trim() || "3000"}`;
}

/** URL canonique de la ressource MCP protégée (RFC 8707 / 9728). */
export function mcpResourceUrl(): string {
  return `${oauthIssuer()}/api/mcp`;
}
