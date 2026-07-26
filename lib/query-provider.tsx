"use client";

import { QueryClient, type Query } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState, type ReactNode } from "react";

/**
 * Le cache est PERSISTÉ dans localStorage (MIN-89).
 *
 * L'app est entièrement rendue côté client : un rechargement complet repartait
 * de zéro — bundle, restauration de session, puis une douzaine de requêtes avant
 * le premier contenu utile. En réhydratant le cache depuis le disque, la page
 * repeint immédiatement le dernier état connu, pendant que le pont temps réel
 * (lib/realtime-provider.tsx) et les refetchs de montage réconcilient derrière.
 * C'est du stale-while-revalidate, pas une source de vérité : rien n'est servi
 * depuis le disque au-delà de PERSIST_MAX_AGE_MS.
 */

/** Clé de stockage. Voir clearPersistedQueryCache() pour la purge à la déconnexion. */
export const QUERY_CACHE_STORAGE_KEY = "minddy.query-cache";

/**
 * Au-delà, le snapshot est jeté plutôt que réhydraté : réafficher un board d'il
 * y a une semaine le temps d'un refetch serait pire que le squelette.
 */
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * `gcTime` global ≥ `PERSIST_MAX_AGE_MS` : une query ramassée en mémoire sort du
 * snapshot, donc un gcTime plus court viderait le disque au fil de la session et
 * annulerait la persistance.
 */
const GC_TIME_MS = PERSIST_MAX_AGE_MS;

/**
 * Invalide tout snapshot écrit par une version antérieure du client. À bumper
 * dès qu'une forme de données en cache change de façon incompatible — sinon un
 * ancien snapshot serait réhydraté dans du code qui ne sait plus le lire.
 */
const PERSIST_BUSTER = "v1";

/**
 * Ce qui NE va PAS sur le disque.
 *
 * - `["me","search-index"]` : jusqu'à 4 000 lignes, soit le quota localStorage à
 *   lui seul (~5 Mo) ; il est de toute façon conçu pour être rechargé une fois
 *   par onglet, à l'inactivité (lib/use-search-index.ts).
 * - les flux d'exécution d'agent : ils pollent à la seconde et se périment
 *   aussi vite — un snapshot afficherait un run terminé comme actif. Ils
 *   portent tous `refetchOnMount: "always"` (lib/use-agent-runs.ts), donc les
 *   exclure ne coûte rien : ils repartaient du serveur de toute façon.
 * - `["billing", …]` : droits et quotas. Repartir du serveur évite d'ouvrir une
 *   fonctionnalité payante sur la foi d'un cache disque.
 *
 * Les préfixes ci-dessous sont les VRAIES clés (cf. lib/use-agent-runs.ts) :
 * s'en écarter donnerait une liste qui ne filtre rien tout en prétendant le
 * contraire.
 */
const NON_PERSISTED_KEY_PREFIXES: string[][] = [
  ["me", "search-index"],
  ["agent-run"], // ["agent-run", runId]
  ["agent-runs"], // ["agent-runs", "issue", issueId]
  ["agent-run-events"],
  ["agent-run-pr"],
  ["agent-run-diff"],
  ["agent-sessions"], // ["agent-sessions", "all"]
  ["agent-activity"],
  ["pull-requests"], // ["pull-requests", "all"]
  ["pr-comments"],
  ["pr-review-comments"],
  ["billing"],
];

/** Exportée pour le test unitaire (lib/query-persist.test.ts). */
export function isPersistableKey(key: readonly unknown[]): boolean {
  return !NON_PERSISTED_KEY_PREFIXES.some((prefix) =>
    prefix.every((segment, i) => key[i] === segment)
  );
}

function isPersistable(query: Query): boolean {
  // Une query en erreur ne doit pas figer son échec sur le disque.
  if (query.state.status !== "success") return false;
  return isPersistableKey(query.queryKey);
}

/**
 * Purge le snapshot. Appelée à la déconnexion : le cache porte les données du
 * compte qui part, et la machine peut être partagée.
 */
export function clearPersistedQueryCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage indisponible (navigation privée, quota) — rien à purger.
  }
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // La fraîcheur vient du pont temps réel, pas de l'horloge : depuis
            // MIN-89 il couvre TOUS mes projets, plus les caches agrégés.
            staleTime: 5 * 60_000,
            gcTime: GC_TIME_MS,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // Le persister touche localStorage : il ne peut être construit qu'au premier
  // rendu client. useState(fn) le garantit.
  const [persistOptions] = useState(() => ({
    persister: createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: QUERY_CACHE_STORAGE_KEY,
      // Le persister avale ses propres erreurs d'écriture (quota dépassé) : le
      // cache disque est un bonus, jamais un chemin critique.
      throttleTime: 1_000,
    }),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: PERSIST_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: isPersistable },
  }));

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
