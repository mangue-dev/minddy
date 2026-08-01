"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BUILD_COMMIT,
  readDismissedCommit,
  shouldShowNewVersion,
  writeDismissedCommit,
} from "./new-version";

/**
 * « Une nouvelle version est disponible » (MIN-157) : compare en boucle le SHA
 * du déploiement qui répond à celui figé dans ce bundle.
 *
 * C'est un `useQuery` et pas un `setInterval`, pour une raison précise : chez
 * TanStack les timers sont pilotés par le `focusManager`, qui écoute
 * `visibilitychange`, et `refetchIntervalInBackground` vaut `false` par défaut.
 * L'onglet en arrière-plan suspend donc le polling sans une ligne à écrire.
 *
 * La clé est exclue de la persistance disque (lib/query-provider.tsx) : un SHA
 * serveur réhydraté depuis le localStorage rallumerait le bandeau juste après
 * le rechargement qui vient de mettre l'app à jour.
 */
export const NEW_VERSION_KEY = ["version"] as const;

/** Une minute : absorbe les ~30 s de propagation de l'environnement Vercel
    après un déploiement, pour ~30 octets par onglet actif. */
const POLL_INTERVAL_MS = 60_000;

export function useNewVersion() {
  const { data } = useQuery({
    queryKey: NEW_VERSION_KEY,
    queryFn: async (): Promise<{ commit: string }> => {
      const response = await fetch("/api/version");
      if (!response.ok) return { commit: "" };
      return (await response.json()) as { commit: string };
    },
    // Sans SHA de build (dev local, variables système décochées) il n'y a rien à
    // comparer : on n'émet même pas la requête.
    enabled: BUILD_COMMIT !== "",
    refetchInterval: POLL_INTERVAL_MS,
    // Le défaut du dépôt est `false` : ici on veut une vérification au retour
    // sur l'onglet, et `staleTime: 0` pour que ce refetch ait lieu — le
    // staleTime global de 5 min le neutraliserait.
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Un réseau coupé n'est pas un déploiement : on retentera au tick suivant.
    retry: false,
  });

  // Lu après montage seulement : lire le localStorage au rendu ferait diverger
  // l'hydratation (cf. CookieBanner).
  const [dismissedCommit, setDismissedCommit] = useState<string | null>(null);
  useEffect(() => {
    setDismissedCommit(readDismissedCommit());
  }, []);

  const serverCommit = data?.commit;

  const dismiss = useCallback(() => {
    if (!serverCommit) return;
    writeDismissedCommit(serverCommit);
    setDismissedCommit(serverCommit);
  }, [serverCommit]);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    visible: shouldShowNewVersion({
      buildCommit: BUILD_COMMIT,
      serverCommit,
      dismissedCommit,
    }),
    dismiss,
    refresh,
  };
}
