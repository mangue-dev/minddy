import type { Locale } from "@/i18n/config";
import { routeByPath } from "@/lib/public-routes";

/**
 * Traduit un lien du site public dans la langue servie (MIN-88).
 *
 * Les liens de la nav, du pied de page et des sections sont écrits une fois, en
 * anglais canonique (`/pricing`, `/#tracker`, `/legal`). Sans cette fonction,
 * un visiteur arrivé sur `/fr` repartait en anglais dès le premier clic — et
 * chaque page française devenait un cul-de-sac pour un crawler, qui n'y trouve
 * aucun lien vers le reste de la version française.
 *
 * L'ancre est conservée telle quelle (`/#tracker` → `/fr#tracker`) : les
 * identifiants de section ne sont pas traduits, seul le chemin l'est. Les URLs
 * qui n'ont pas d'équivalent localisé (`/login`, `/signup`) sont rendues
 * inchangées — elles n'existent qu'en une version.
 */
export function localizedHref(href: string, locale: Locale): string {
  if (locale !== "fr") return href;

  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);

  const route = routeByPath(path || "/");
  if (!route) return href;

  // `/fr` + `#tracker`, et non `/fr/#tracker` : les deux mènent au même endroit
  // mais seule la première est l'URL canonique de la page.
  return `${route.fr}${hash}`;
}

/**
 * Chemin équivalent de la page courante dans l'autre langue — ce que doit
 * pousser le sélecteur de langue du pied de page. `null` si la page n'a pas de
 * version localisée (l'app interne, `/login`…), auquel cas on reste sur place.
 */
export function switchLocaleHref(pathname: string, next: Locale): string | null {
  const route = routeByPath(pathname);
  if (!route) return null;
  return next === "fr" ? route.fr : route.en;
}
