/**
 * L'avatar par défaut de minddy.
 *
 * Un compte sans photo ne montre plus ses initiales : il reçoit une marque
 * abstraite colorée, dérivée déterministiquement de son identifiant. Même
 * compte = même marque, à chaque rendu, sur chaque écran, sans rien stocker.
 * Une photo de profil reste prioritaire quand le compte en a une.
 *
 * Le dessin vient de `boring-avatars` (variante `beam`) : une frimousse sur une
 * pastille ronde, deux teintes et un visage tracé en noir ou en blanc selon la
 * luminance de la première. Le rendu est dans `components/user-avatar.tsx`,
 * seul endroit du produit qui dessine un avatar.
 */

/** Variante `boring-avatars`. */
export const AVATAR_VARIANT = "beam" as const;

/**
 * La roue des teintes, par pas d'environ 24°. Même vocabulaire que les
 * catégories (`lib/category-colors.ts`, des Tailwind 500), en couvrant tout le
 * cercle plutôt qu'un échantillon.
 *
 * L'ordre compte, et la longueur aussi. `beam` tire deux couleurs : la tête à
 * `hash(seed) % longueur`, le fond treize crans plus loin. Rangées par teinte,
 * ces deux-là tombent à deux pas l'une de l'autre sur la roue — assez proches
 * pour s'accorder, assez distinctes pour que la tête se détache du fond. Et plus
 * la roue est longue, moins deux comptes tombent sur le même départ : quinze
 * places, contre neuf pour la palette des catégories, où deux membres sur trois
 * se retrouvaient identiques.
 */
export const AVATAR_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#d946ef", // fuchsia
  "#ec4899", // pink
];
