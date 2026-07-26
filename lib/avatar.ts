import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";

/**
 * L'avatar par défaut de minddy.
 *
 * Un compte ne porte pas de photo : il porte une graine opaque
 * (`public.user_avatars`), et son portrait se dessine à partir d'elle. Même
 * graine = même portrait, à chaque rendu, sur chaque écran, sans rien stocker.
 * Un nouveau tirage (réglages → « Nouvel avatar ») change la graine, donc le
 * portrait.
 *
 * Le dessin vient du style `lorelei` de DiceBear (CC0, Lisa Wischofsky) : un
 * visage au trait sur un aplat coloré. Il ne cadre QUE la tête, ce qui le rend
 * encore lisible à 22 px — là où un buste rétrécit en tache. Le rendu est dans
 * `components/user-avatar.tsx`, seul endroit du produit qui dessine un avatar.
 */

/**
 * Les fonds, sur lesquels DiceBear tire d'après la graine. Une roue de teintes
 * par pas d'environ 24°, dans le même vocabulaire que les catégories
 * (`lib/category-colors.ts`, des Tailwind 500) mais couvrant tout le cercle.
 * Quinze places : plus la roue est longue, moins deux comptes se retrouvent sur
 * la même couleur. Sans `#` — DiceBear veut des hexadécimaux nus.
 */
export const AVATAR_BACKGROUNDS = [
  "ef4444", // red
  "f97316", // orange
  "f59e0b", // amber
  "eab308", // yellow
  "84cc16", // lime
  "22c55e", // green
  "10b981", // emerald
  "14b8a6", // teal
  "06b6d4", // cyan
  "0ea5e9", // sky
  "3b82f6", // blue
  "6366f1", // indigo
  "8b5cf6", // violet
  "d946ef", // fuchsia
  "ec4899", // pink
];

/**
 * Portraits déjà calculés, par graine.
 *
 * Deux raisons de garder ce cache. D'abord `createAvatar` reconstruit tout le
 * SVG à chaque appel, et un board redessine les mêmes personnes des dizaines de
 * fois. Ensuite les `<img>` partagent alors la MÊME chaîne : le navigateur ne
 * décode qu'une image, et le DOM ne porte qu'une référence de plus.
 *
 * Purge en bloc au-delà du plafond : le nombre de personnes croisées dans une
 * session se compte en dizaines, donc on ne l'atteint pas — c'est un garde-fou
 * contre une fuite, pas une politique de cache à affiner.
 */
const portraits = new Map<string, string>();
const MAX_PORTRAITS = 500;

/** Le portrait d'une graine, en `data:` URI prêt pour un `<img>`. */
export function avatarDataUri(seed: string): string {
  const known = portraits.get(seed);
  if (known) return known;

  // Sans option `size`, le SVG ne porte qu'un `viewBox` : il s'adapte donc à la
  // taille CSS de l'image, net à 16 px comme à 64 px, et pèse moins lourd.
  const uri = createAvatar(lorelei, {
    seed,
    backgroundColor: AVATAR_BACKGROUNDS,
  }).toDataUri();

  if (portraits.size >= MAX_PORTRAITS) portraits.clear();
  portraits.set(seed, uri);
  return uri;
}
