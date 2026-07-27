/**
 * Table des pages publiques du site (MIN-88) — la seule.
 *
 * Quatre choses avaient besoin de connaître cette liste, et chacune en tenait sa
 * propre copie : le proxy (quoi laisser passer sans session), le sitemap, les
 * métadonnées de chaque page, et les liens de la nav et du pied de page. Quatre
 * listes qui se désynchronisent au premier ajout de page. Elles lisent
 * désormais celle-ci.
 *
 * **URLs localisées, anglais canonique.** L'anglais vit à la racine (`/`,
 * `/pricing`), le français sous `/fr` avec des slugs traduits (`/fr`,
 * `/fr/tarifs`). Une URL = une langue : c'est la seule forme qu'un moteur sait
 * indexer. Avant, une URL unique servait les deux langues selon un cookie et
 * l'`Accept-Language` — Googlebot ne voyait que l'anglais, et la moitié du
 * contenu du site n'existait pour personne.
 *
 * Il n'y a PAS de fichiers de route dupliqués sous `app/fr/` : le proxy réécrit
 * `/fr/tarifs` vers `/pricing` en posant `x-minddy-locale: fr`, que
 * `i18n/request.ts` lit pour servir le français. Une seule page, deux URLs.
 *
 * L'app interne (derrière l'authentification) ne suit PAS ce modèle : elle
 * reste sur le cookie `NEXT_LOCALE`. Ses URLs n'ont pas à être indexées, donc
 * rien n'oblige à les dédoubler.
 */

/**
 * `lastModified` est le seul des trois champs de sitemap que Google lit
 * vraiment (`priority` et `changeFrequency` sont ignorés depuis longtemps ;
 * Bing les regarde encore un peu) : c'est lui qui déclenche un nouveau passage
 * du crawler. Il est donc tenu à la main, page par page — une date de build
 * remise à jour à chaque déploiement voudrait dire « tout a changé » à chaque
 * fois, et Google apprend vite à ne plus y croire. **À mettre à jour quand le
 * contenu de la page change**, pas à chaque déploiement.
 */
import { CHANGELOG_LAST_MODIFIED } from "@/lib/changelog";

export interface PublicRoute {
  /** Clé stable, utilisée par `publicPageMetadata` et les liens. */
  key: string;
  /** URL canonique (anglais). */
  en: string;
  /** URL française. */
  fr: string;
  /** Namespace i18n où vivent `metaTitle` et `metaDescription`. */
  namespace: string;
  /**
   * Le titre porte-t-il déjà la marque ? La landing s'appelle « minddy, … » :
   * le template « %s · minddy » du root layout la répéterait.
   */
  titleIsAbsolute?: boolean;
  /** Dernière modification réelle du contenu, en ISO court. */
  lastModified: string;
  /** Poids relatif dans le sitemap. */
  priority: number;
}

export const PUBLIC_ROUTES = [
  {
    key: "home",
    en: "/",
    fr: "/fr",
    namespace: "Landing",
    titleIsAbsolute: true,
    lastModified: "2026-07-27",
    priority: 1,
  },
  {
    key: "pricing",
    en: "/pricing",
    fr: "/fr/tarifs",
    namespace: "Pricing",
    lastModified: "2026-07-27",
    priority: 0.8,
  },
  {
    key: "mcp",
    en: "/mcp",
    fr: "/fr/mcp",
    namespace: "Mcp",
    lastModified: "2026-07-27",
    priority: 0.9,
  },
  // Seule page dont le `lastModified` n'est PAS tenu à la main : ici,
  // « le contenu a changé » et « une entrée a été ajoutée » sont le même
  // événement, et la fraîcheur est ce que Perplexity regarde en premier.
  {
    key: "changelog",
    en: "/changelog",
    fr: "/fr/nouveautes",
    namespace: "Changelog",
    lastModified: CHANGELOG_LAST_MODIFIED,
    priority: 0.6,
  },
  // Un comparatif = une entrée, comme n'importe quelle page (MIN-93). Les
  // slugs sont les mêmes dans les deux langues : `alternatives` s'écrit
  // pareil, et le nom du concurrent est un nom propre. Voir
  // `lib/comparisons.ts` pour le choix de ces trois-là.
  {
    key: "alternativeLinear",
    en: "/alternatives/linear",
    fr: "/fr/alternatives/linear",
    namespace: "AlternativeLinear",
    lastModified: "2026-07-27",
    priority: 0.7,
  },
  {
    key: "alternativeJira",
    en: "/alternatives/jira",
    fr: "/fr/alternatives/jira",
    namespace: "AlternativeJira",
    lastModified: "2026-07-27",
    priority: 0.7,
  },
  {
    key: "alternativeNotion",
    en: "/alternatives/notion",
    fr: "/fr/alternatives/notion",
    namespace: "AlternativeNotion",
    lastModified: "2026-07-27",
    priority: 0.7,
  },
  {
    key: "legal",
    en: "/legal",
    fr: "/fr/mentions-legales",
    namespace: "Legal",
    lastModified: "2026-07-23",
    priority: 0.3,
  },
  {
    key: "terms",
    en: "/terms",
    fr: "/fr/cgu",
    namespace: "Terms",
    lastModified: "2026-07-23",
    priority: 0.3,
  },
  {
    key: "privacy",
    en: "/privacy",
    fr: "/fr/confidentialite",
    namespace: "Privacy",
    lastModified: "2026-07-24",
    priority: 0.3,
  },
  {
    key: "cookies",
    en: "/cookies",
    fr: "/fr/cookies",
    namespace: "Cookies",
    lastModified: "2026-07-23",
    priority: 0.3,
  },
] as const satisfies ReadonlyArray<PublicRoute>;

export type PublicRouteKey = (typeof PUBLIC_ROUTES)[number]["key"];

/** Tous les chemins publics, EN et FR — ce que le proxy laisse passer. */
export const PUBLIC_ROUTE_PATHS: ReadonlySet<string> = new Set(
  PUBLIC_ROUTES.flatMap((route) => [route.en, route.fr]),
);

/** Les seuls chemins FR, pour la branche de réécriture du proxy. */
const FR_TO_EN = new Map<string, string>(
  PUBLIC_ROUTES.map((route) => [route.fr, route.en]),
);

/** Chemin anglais équivalent d'une URL française publique, ou `null`. */
export function englishPathForFrench(pathname: string): string | null {
  return FR_TO_EN.get(pathname) ?? null;
}

const BY_PATH = new Map<string, PublicRoute>(
  PUBLIC_ROUTES.flatMap((route) => [
    [route.en, route as PublicRoute],
    [route.fr, route as PublicRoute],
  ]),
);

/** L'entrée de la table qui sert ce chemin (EN ou FR), ou `null`. */
export function routeByPath(pathname: string): PublicRoute | null {
  return BY_PATH.get(pathname) ?? null;
}

const BY_KEY = new Map<string, PublicRoute>(
  PUBLIC_ROUTES.map((route) => [route.key, route as PublicRoute]),
);

export function routeByKey(key: PublicRouteKey): PublicRoute {
  const route = BY_KEY.get(key);
  // La clé vient d'un type littéral : ce cas ne peut survenir qu'en JS pur.
  if (!route) throw new Error(`Unknown public route: ${key}`);
  return route;
}
