"use client";

import { useEffect, useRef } from "react";

/**
 * Émet un événement « vu » UNE SEULE FOIS par occurrence logique (MIN-78).
 *
 * Pourquoi une garde et pas un simple `useEffect` :
 *
 *  - **React StrictMode**, actif par défaut en développement Next, monte puis
 *    démonte puis remonte chaque composant : l'effet est invoqué DEUX fois.
 *    Sans garde, chaque ouverture compte double et tous les taux de conversion
 *    sont faux d'un facteur deux — ce qui s'est vu en recette avec
 *    `issue_create_dialog_opened` émis deux fois à 3 ms d'intervalle.
 *  - Un simple re-rendu (prop qui change, refetch react-query) relancerait
 *    l'effet aussi, y compris en production.
 *
 * `active` est la condition d'affichage (dialog ouvert, page montée) ; la
 * repasser à `false` réarme l'émission pour la prochaine ouverture. `key`
 * identifie l'occurrence à l'intérieur d'une même ouverture : la changer réarme
 * l'émission — c'est ce qui permet de tracker chaque étape d'un wizard sans
 * re-tracker celles déjà vues quand on revient en arrière.
 */
export function useTrackView(active: boolean, key: string, emit: () => void): void {
  const seen = useRef<Set<string>>(new Set());
  // L'émetteur est lu via une ref pour qu'une closure recréée à chaque rendu
  // (le cas normal) ne relance pas l'effet et ne double pas l'événement.
  const emitRef = useRef(emit);
  emitRef.current = emit;

  useEffect(() => {
    if (!active) {
      seen.current.clear();
      return;
    }
    if (seen.current.has(key)) return;
    seen.current.add(key);
    emitRef.current();
  }, [active, key]);
}
