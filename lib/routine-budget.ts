/**
 * Le PLAFOND DE DÉPENSE d'un passage de routine — le réglage, partagé entre le
 * serveur (qui le valide et le rend exécutoire) et l'écran (qui le propose).
 *
 * Il se dit en POURCENTAGE du budget d'usage mensuel du plan, jamais en
 * dollars : c'est l'unité dans laquelle l'usage se lit partout dans minddy (la
 * barre du header, la page facturation, la carte de budget épuisé), la seule
 * que l'utilisateur ait jamais vue — et la seule qui SUIVE le plan, sans rien à
 * recalculer le jour où l'abonnement change.
 *
 * Ce module ne dépend de rien : il est importé côté serveur (`lib/server/routines.ts`)
 * comme côté navigateur (le wizard, l'éditeur du volet de détail, le suivi
 * d'usage). Un défaut recopié des deux côtés aurait fini par diverger.
 */

/**
 * Ce qu'un passage peut dépenser par défaut : 15 % du budget du mois.
 *
 * Le défaut protège le MOIS, pas seulement le pire passage. Une routine part
 * toute seule, plusieurs fois par mois, sans que personne ne regarde sa barre
 * d'usage : ce qui compte n'est donc pas qu'un passage isolé s'arrête avant la
 * fin du budget, c'est qu'une routine hebdomadaire tienne son mois et laisse
 * l'essentiel au travail à la main. À 15 %, six passages tiennent dans le
 * budget ; à 90 %, un seul suffisait à tout prendre — et c'est arrivé.
 *
 * Il se MONTE, routine par routine, quand on sait laquelle mérite d'aller plus
 * loin. C'est le sens de la marche : un plafond bas par défaut se relève sur
 * décision, là où un plafond haut ne se baisse qu'après la facture.
 */
export const DEFAULT_MAX_SPEND_PERCENT = 15;

/** 100 % = pas de plafond propre : seul le quota du compte borne le passage. */
export const NO_SPEND_CAP_PERCENT = 100;

/**
 * Les paliers proposés à l'écran. Un champ libre demanderait de choisir un
 * nombre exact là où personne n'a d'avis au pourcent près ; ces cinq-là
 * couvrent les intentions réelles — « une routine quotidienne parmi d'autres »
 * (5 %), le défaut, « celle-ci compte » (25 %), « la moitié de mon mois »
 * (50 %), et « sans plafond ».
 */
export const SPEND_CAP_CHOICES = [5, DEFAULT_MAX_SPEND_PERCENT, 25, 50, NO_SPEND_CAP_PERCENT];

/**
 * Le plafond ramené dans ses bornes (1–100, entier). Une valeur absurde vaut le
 * défaut plutôt qu'un refus : le CHECK de la base, lui, ne pardonnerait pas, et
 * une routine ne doit pas se refuser sur un pourcentage mal écrit par une des
 * quatre portes.
 */
export function clampSpendPercent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return DEFAULT_MAX_SPEND_PERCENT;
  return Math.min(100, Math.max(1, n));
}
