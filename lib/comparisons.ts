import type { Namespace } from "@/lib/i18n-keys";

import type { PublicRouteKey } from "@/lib/public-routes";

/**
 * Les pages `/alternatives/<outil>` (MIN-93) — un comparatif par concurrent.
 *
 * ## Comment ces trois-là ont été choisis
 *
 * Le plan demandait de trancher sur des données : les référents PostHog et les
 * réponses du board de feedback. Relevé le 27 juillet 2026, il n'y en a pas —
 * 12 pages vues externes pour 10 personnes depuis la mise en service du suivi,
 * et un seul billet de feedback, interne. Un choix « piloté par la donnée » sur
 * douze visites serait une décoration.
 *
 * Faute de mieux, on reprend donc les trois outils que la description du produit
 * nomme déjà (`Landing.metaDescription` dit « alternative simple à Linear ou
 * Jira ») et qui portent le volume de recherche sur « alternative à X ». À
 * refaire quand le trafic dira quelque chose.
 *
 * ## Ce qui est comparé, et ce qui ne l'est pas
 *
 * Quatre lignes seulement : ce que coûte un collègue, ce que les agents de code
 * y font, ce qu'il faut configurer avant d'écrire un ticket, et pour qui
 * l'outil est fait. Aucune liste de fonctions, aucun prix recopié, aucune croix
 * sur le produit d'un concurrent.
 *
 * C'est délibéré. Un tableau de trente croix est périmé au trimestre suivant, et
 * il suffit d'UNE croix fausse pour qu'un lecteur qui connaît l'autre outil
 * cesse de croire le reste de la page — donc aussi les modèles, qui citent en
 * priorité les sources qui reconnaissent leurs limites. Chaque page dit
 * d'ailleurs d'abord ce que l'autre fait mieux.
 *
 * ## Les deux erreurs à ne pas refaire
 *
 * **Non, minddy n'est pas « un forfait pour toute l'équipe ».** La première
 * version de ces pages l'écrivait, et c'était faux : le owner paye les limites
 * de SES projets, mais chacun garde son propre plan pour les fonctions IA
 * (`lib/server/entitlements.ts` : « une limite structurelle se vérifie sur le
 * plan du OWNER ; une action IA se paye sur le plan de son ACTEUR »). Ce qui est
 * vrai, et c'est déjà une différence : un collègue qui vient suivre des tickets
 * ne coûte pas un siège de plus.
 *
 * **Non, minddy n'est pas le seul à parler MCP.** Linear publie
 * `mcp.linear.app/mcp`, Atlassian son serveur Rovo en OAuth 2.1, Notion le
 * sien. La différence tenable est plus fine : chez minddy le ticket porte son
 * plan, et l'agent le coche au fil du travail.
 */

export interface Comparison {
  /** Segment d'URL : `/alternatives/<slug>`. */
  slug: string;
  /** Nom propre du concurrent — jamais traduit, jamais dans le catalogue i18n. */
  name: string;
  /** Entrée de `lib/public-routes.ts` qui sert cette page. */
  routeKey: PublicRouteKey;
  /** Namespace i18n des textes propres à ce comparatif. */
  namespace: Namespace;
  /** Sa page de tarifs publique : le lecteur doit pouvoir vérifier lui-même. */
  pricingUrl: string;
}

export const COMPARISONS = [
  {
    slug: "linear",
    name: "Linear",
    routeKey: "alternativeLinear",
    namespace: "AlternativeLinear",
    pricingUrl: "https://linear.app/pricing",
  },
  {
    slug: "jira",
    name: "Jira",
    routeKey: "alternativeJira",
    namespace: "AlternativeJira",
    pricingUrl: "https://www.atlassian.com/software/jira/pricing",
  },
  {
    slug: "notion",
    name: "Notion",
    routeKey: "alternativeNotion",
    namespace: "AlternativeNotion",
    pricingUrl: "https://www.notion.com/pricing",
  },
] as const satisfies ReadonlyArray<Comparison>;

export type ComparisonSlug = (typeof COMPARISONS)[number]["slug"];

/**
 * Les lignes du tableau, dans l'ordre. Clés i18n : `Alternatives.row_<clé>` pour
 * le libellé, `Alternatives.minddy_<clé>` pour la cellule de minddy, et
 * `<namespace du concurrent>.them_<clé>` pour la sienne.
 *
 * Que des cellules de TEXTE, aucune case à cocher : une croix dans la colonne
 * d'un concurrent se lit comme une accusation, et demande d'être sûr d'un
 * absent — ce qu'on ne peut pas être.
 */
export const COMPARISON_ROWS = [
  "teammate",
  "agents",
  "setup",
  "builtFor",
] as const;

export type ComparisonRow = (typeof COMPARISON_ROWS)[number];

/** Les trois arguments de chaque colonne de prose, de part et d'autre. */
export const COMPARISON_POINTS = [1, 2, 3] as const;

export function comparisonBySlug(slug: string): Comparison | null {
  return COMPARISONS.find((entry) => entry.slug === slug) ?? null;
}
