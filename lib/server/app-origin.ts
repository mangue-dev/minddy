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
 * Trois cas, dans cet ordre :
 * - production Vercel — le domaine canonique, quel que soit l'alias emprunté ;
 * - preview Vercel — l'URL du déploiement, pour qu'un preview reste chez lui ;
 * - poste de dev — le localhost du serveur.
 *
 * Volontairement PAS `NEXT_PUBLIC_APP_URL` : elle vaut le domaine de prod
 * jusque sur un preview (voir `lib/server/agent/origin.ts`).
 */
export function canonicalAppOrigin(): string {
  if (process.env.VERCEL_ENV?.trim() === "production") return SITE_URL;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return `http://localhost:${process.env.PORT?.trim() || "3000"}`;
}
