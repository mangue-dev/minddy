"use client";

import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";

/**
 * Première marche de l'entonnoir d'acquisition (MIN-78).
 *
 * Pourquoi un événement dédié plutôt que de se reposer sur `$pageview` :
 *  - un entonnoir bâti sur `$pageview` + filtre d'URL casse au premier
 *    changement de route, et attrape aussi les visites internes vers `/` ;
 *  - `landing_viewed` dit ce qu'on mesure — « quelqu'un a vu l'argumentaire » —
 *    ce que `$pageview` sur `/` ne dit qu'indirectement.
 *
 * La page étant un composant serveur, ce composant client minimal ne fait que
 * l'émission. Il n'est rendu que pour les visiteurs DÉCONNECTÉS : la page
 * redirige les autres vers `/home` avant d'arriver ici.
 */
export function LandingViewed() {
  const { track } = useAnalytics();
  useTrackView(true, "landing", () => track("landing_viewed", {}));
  return null;
}
