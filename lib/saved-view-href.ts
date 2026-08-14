/**
 * L'adresse d'une vue enregistrée — ce qui, de l'écran courant, se ré-ouvre.
 *
 * Une vue enregistrée ne photographie pas un écran : elle retient l'ADRESSE qui
 * le reconstitue. Dans minddy, l'adresse dit déjà presque tout — la route, la
 * page du wiki, l'onglet des réglages, l'objectif ouvert, la vue d'un board.
 * Ce qu'elle ne dit pas (la conversation choisie dans /agents, la PR
 * sélectionnée), c'est la page elle-même qui le publie, via
 * lib/current-view-context.tsx.
 *
 * Reste ce qu'il faut RETIRER. Deux familles de paramètres n'ont rien à faire
 * dans une vue enregistrée :
 *
 * - ceux qui posent une SURIMPRESSION par-dessus l'écran — le panneau latéral
 *   d'un ticket (`?issue=`), le wizard de création (`?new=`, `?setup=`), le
 *   brouillon de conversation (`?compose=`). Une vue enregistrée enregistre la
 *   page, pas la boîte de dialogue ouverte devant.
 * - ceux qui sont des INSTRUCTIONS À USAGE UNIQUE, que la page consomme puis
 *   efface de l'URL : le retour de Checkout (`?billing=success`) rejouerait son
 *   toast à chaque ouverture de la vue.
 *
 * Les autres restent : `?view=`, `?tab=`, `?open=`, `?post=`, `?run=`,
 * `?routine=`, `?pr=` désignent tous une partie de ce qu'on a sous les yeux.
 *
 * Module PUR (aucun accès au DOM, aucun import serveur) : le client s'en sert
 * pour fabriquer l'adresse, le serveur pour la valider avant écriture.
 */

/**
 * Paramètres retirés de l'adresse au moment d'enregistrer. Voir l'en-tête pour
 * le partage : surimpressions d'un côté, instructions à usage unique de l'autre.
 */
export const OVERLAY_PARAMS: readonly string[] = [
  "issue", // panneau latéral d'un ticket (board projet, /all)
  "new", // dialogue de création (?new=1, ?new=issue)
  "setup", // wizard d'amorce d'un projet (?setup=import|numo)
  "compose", // brouillon de conversation de l'agent
  "billing", // retour de Checkout, consommé puis effacé
];

/** Longueur maximale d'une adresse enregistrée (bornes MIN-118). */
export const MAX_HREF_LENGTH = 2000;
/** Longueur maximale du nom d'une vue — comme les vues de board. */
export const MAX_VIEW_NAME_LENGTH = 200;

/**
 * `pathname` + query nettoyée, plus ce que la page ajoute d'elle-même.
 *
 * L'ordre des paramètres déjà présents est préservé : c'est celui que la page a
 * écrit, et deux adresses identiques à l'ordre près doivent rester deux textes
 * identiques (l'unicité du nom s'appuie dessus). Dans `extra`, une valeur
 * `null` RETIRE le paramètre — c'est ainsi qu'une page dit « pas de sélection »
 * sans avoir à recopier la logique de nettoyage.
 */
export function buildViewHref(
  pathname: string,
  search: string,
  extra?: Record<string, string | null>
): string {
  const path = pathname || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of OVERLAY_PARAMS) params.delete(key);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Une adresse enregistrable est une adresse INTERNE : un chemin absolu, sans
 * schéma ni hôte. `//ailleurs.example` est un chemin absolu pour la grammaire
 * des URLs mais une adresse protocol-relative pour un navigateur — elle sort du
 * site, et c'est exactement ce qu'un enregistrement ne doit pas pouvoir faire.
 */
export function isSavedViewHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.length === 0 || href.length > MAX_HREF_LENGTH) return false;
  if (!href.startsWith("/")) return false;
  if (href.startsWith("//")) return false;
  // `/\ailleurs` : certains navigateurs lisent l'antislash comme une barre.
  if (href.startsWith("/\\")) return false;
  // Une adresse ne contient ni espace ni caractère de contrôle : un saut de
  // ligne collé dans le champ ne doit pas devenir une route.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(href)) return false;
  return true;
}

/**
 * Le nom tel qu'il sera stocké : espaces rognés, longueur bornée. `null` quand
 * il ne reste rien — l'appelant en fait une erreur « nom requis ».
 */
export function normalizeViewName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_VIEW_NAME_LENGTH);
}
