/**
 * Ce que la fenêtre de l'app n'affiche jamais (MIN-291).
 *
 * Le site public s'adresse à quelqu'un qui ne s'est pas encore décidé. Dans
 * l'app installée, cette personne n'existe pas : elle a téléchargé, elle a
 * passé le premier lancement, elle veut son travail. Une fenêtre qui retombe
 * sur l'argumentaire — au lancement, ou parce qu'un logo pointe vers `/` — a
 * l'air cassée.
 *
 * **La liste se DÉRIVE de [public-routes.ts](../public-routes.ts)**, elle ne se
 * recopie pas : c'est la table unique des pages publiques, et la convention du
 * dépôt est qu'y ajouter une entrée suffit. Une page publique de plus est donc
 * automatiquement hors de la fenêtre, sans que personne ait à y penser.
 *
 * **Sauf les pages légales.** L'écran d'inscription pointe vers les CGU et la
 * politique de confidentialité, sous le bouton, à l'endroit exact où on collecte
 * des données. Ces liens-là doivent s'ouvrir : les renvoyer vers l'app rendrait
 * une mention d'information illisible depuis l'app de bureau.
 */

import { PUBLIC_ROUTES, type PublicRouteKey } from "@/lib/public-routes";

/** Les pages publiques qui restent atteignables DANS la fenêtre. */
const READABLE_IN_APP: ReadonlySet<PublicRouteKey> = new Set<PublicRouteKey>([
  "legal",
  "terms",
  "privacy",
  "cookies",
]);

/** Tous les chemins du site public hors pages légales, EN et FR. */
export const MARKETING_PATHS: ReadonlySet<string> = new Set(
  PUBLIC_ROUTES.filter((route) => !READABLE_IN_APP.has(route.key)).flatMap(
    (route) => [route.en, route.fr]
  )
);

/** `/pricing/` et `/pricing` sont la même page ; `/` reste `/`. */
function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * Ce chemin est-il une page du site public que la fenêtre doit refuser ?
 *
 * Accepte un chemin ou une URL complète — le main process voit passer des URLs,
 * le renderer des chemins.
 */
export function isMarketingPath(pathOrUrl: string): boolean {
  let pathname = pathOrUrl;
  if (!pathname.startsWith("/")) {
    try {
      pathname = new URL(pathOrUrl).pathname;
    } catch {
      return false;
    }
  }
  return MARKETING_PATHS.has(normalize(pathname));
}
