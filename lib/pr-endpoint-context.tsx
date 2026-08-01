"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PrEndpoint } from "@/lib/agent-api";

/**
 * De quelle pull request ce morceau d'écran parle-t-il ? Rien, partout ailleurs.
 *
 * Deux besoins l'ont fait naître, et ils posent la même question (MIN-162) :
 *
 *  · **les images.** Une capture collée dans un commentaire de forge n'est pas
 *    servable telle quelle — son URL exige une session GitHub que minddy n'a
 *    pas, et il faut la faire passer par le proxy de SA pull request
 *    (`lib/forge-image-assets`) ;
 *  · **le composer.** Mentionner un compte de la forge et joindre un fichier
 *    demandent tous deux les routes de CETTE pull request.
 *
 * Un contexte plutôt qu'une prop parce que ces surfaces sont nombreuses et
 * profondes — corps de la PR, messages du fil, activité, remarques de ligne et
 * leurs réponses, jusqu'au fond de la vue diff — et parce que la réponse est la
 * même pour toutes : celle du panneau, pas celle du composant. Une seule
 * enveloppe, et la surface suivante l'aura sans rien câbler.
 *
 * La valeur est une `PrEndpoint` et non un id : la vue diff d'une session
 * d'agent passe par les façades `agent-runs/[runId]/pr/*`, et c'est ce qui lui
 * donne exactement le même composer que le panneau PR.
 */
const PrEndpointContext = createContext<PrEndpoint | null>(null);

export function PrEndpointProvider({
  endpoint,
  children,
}: {
  endpoint: PrEndpoint;
  children: ReactNode;
}) {
  return (
    <PrEndpointContext.Provider value={endpoint}>{children}</PrEndpointContext.Provider>
  );
}

/** `null` hors d'une vue de pull request — un commentaire de ticket n'en a pas. */
export function usePrEndpoint(): PrEndpoint | null {
  return useContext(PrEndpointContext);
}
