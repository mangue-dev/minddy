"use client";

import { useCallback, useRef } from "react";

/**
 * Une identité STABLE pour un handler qu'on réécrit à chaque rendu.
 *
 * Le cas qui l'a fait naître (MIN-316) : la carte de ticket passe onze handlers
 * à `useAgentMenuActions`, qui les a tous en dépendances de son `useMemo`. Comme
 * chacun est une fléchée fabriquée dans le corps du composant, le mémo ne
 * tombait JAMAIS juste — il refabriquait une vingtaine d'objets d'action et
 * autant d'icônes JSX, par carte et par rendu, pour un menu fermé.
 *
 * Les stabiliser un par un demanderait onze listes de dépendances à tenir, sur
 * des fonctions qui referment chacune sur une dizaine de valeurs locales : une
 * liste oubliée donnerait un handler qui agit sur un ticket périmé, en silence.
 * Ce crochet renvoie donc une enveloppe dont l'identité ne change jamais et qui
 * appelle toujours la DERNIÈRE version — la lecture se fait à l'appel, donc
 * après le rendu.
 *
 * ⚠ **Pas pour une valeur lue pendant le rendu.** C'est un handler d'événement :
 * appelé pendant le rendu, il lirait une version dont React ne garantit rien.
 * Pour une valeur, `useMemo` ; pour une dépendance d'effet, un vrai
 * `useCallback` avec ses dépendances — un effet qui ne se rejoue jamais parce
 * que sa dépendance est artificiellement stable est un bug, pas une
 * optimisation.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const latest = useRef(fn);
  // Pendant le rendu, et non dans un effet : le handler doit être à jour avant
  // qu'un enfant mémoïsé ne puisse l'appeler, et un effet arrive après.
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}
