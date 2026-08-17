import "server-only";

import { SITE_URL } from "@/lib/site";

/**
 * L'origine CANONIQUE de l'app, dérivée de l'environnement — jamais d'un
 * en-tête de requête.
 *
 * C'est la même règle que l'issuer OAuth, et pour la même raison : un `Host` ou
 * un `X-Forwarded-Host` est une valeur que l'APPELANT choisit. Tout lien qu'on
 * fabrique dessus part vers un domaine qu'on n'a pas décidé — et quand ce lien
 * porte un jeton (invitation, confirmation), le jeton part avec lui. Il suffit
 * de déclencher l'envoi avec le bon en-tête pour que l'e-mail légitime, expédié
 * par nous, sous notre nom, mène chez l'attaquant (MIN-351).
 *
 * Quatre cas, dans cet ordre :
 * - production Vercel — le domaine canonique, quel que soit l'alias emprunté ;
 * - preview Vercel — l'URL du déploiement, pour qu'un preview reste chez lui ;
 * - production auto-hébergée — le domaine canonique configuré par l'opérateur ;
 * - poste de dev — le localhost du serveur.
 *
 * `SITE_URL` porte l'origine publique configurée, mais un preview Vercel la
 * remplace par son URL de déploiement (voir `lib/server/agent/origin.ts`).
 */
export interface AppOriginEnvironment {
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
}

export function resolveCanonicalAppOrigin(
  env: AppOriginEnvironment,
  siteUrl: string,
): string {
  if (env.VERCEL_ENV?.trim() === "production") return siteUrl;

  const vercelUrl = env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  if (env.NODE_ENV === "production") return siteUrl;

  return `http://localhost:${env.PORT?.trim() || "3000"}`;
}

export function canonicalAppOrigin(): string {
  return resolveCanonicalAppOrigin(process.env, SITE_URL);
}
