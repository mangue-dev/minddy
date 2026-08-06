"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { fetchRoutineRunsApi, fetchRoutinesApi, type Routine } from "./routines-api";
import { isAgentRunWorking } from "./agent-api";

/**
 * Les ROUTINES (MIN-185) côté client.
 *
 * La liste ne poll PAS : une routine ne bouge qu'à sa création, à son édition ou
 * à son échéance, et les trois passent par une invalidation explicite (mutation
 * locale, ou pont realtime pour un passage qui démarre). Un timer ne ferait que
 * payer des requêtes pour une liste immobile 23 h sur 24.
 *
 * Les EXÉCUTIONS, elles, suivent la règle des runs d'agent : ~3 s tant qu'un
 * passage travaille, un filet à 12 s tant qu'il y a des runs, rien du tout
 * ensuite.
 */

export function routinesQueryKey() {
  return ["routines"] as const;
}

export function routineRunsQueryKey(routineId: string) {
  return ["routines", routineId, "runs"] as const;
}

/**
 * Écrit une routine DANS LE CACHE, sans requête — le socle de la bascule
 * OPTIMISTE de l'interrupteur (MIN-185).
 *
 * La colonne et le volet de détail lisent la même entrée : un seul écrit met
 * les deux à jour dans le même rendu, sans attendre le serveur. Rend
 * l'instantané d'AVANT, à réinstaller tel quel si l'écriture est refusée —
 * remettre « à la main » le champ qu'on croit avoir changé raterait tout ce que
 * le serveur change avec lui (ici `next_run_at`).
 *
 * `undefined` = la liste n'est pas encore en cache : il n'y a alors rien à
 * annuler, et le prochain chargement dira la vérité.
 */
export function patchRoutineInCache(
  queryClient: QueryClient,
  routineId: string,
  fields: Partial<Routine>,
): { routines: Routine[] } | undefined {
  const previous = queryClient.getQueryData<{ routines: Routine[] }>(routinesQueryKey());
  if (!previous) return undefined;
  queryClient.setQueryData(routinesQueryKey(), {
    ...previous,
    routines: previous.routines.map((r) =>
      r.id === routineId ? { ...r, ...fields } : r,
    ),
  });
  return previous;
}

export function useRoutinesQuery() {
  const { data, isPending } = useQuery({
    queryKey: routinesQueryKey(),
    queryFn: fetchRoutinesApi,
    refetchOnMount: "always",
  });
  return { routines: data?.routines ?? [], loading: isPending };
}

export function useRoutineRunsQuery(routineId: string | null) {
  const enabled = !!routineId;
  const { data, isPending } = useQuery({
    queryKey: routineRunsQueryKey(routineId ?? ""),
    queryFn: () => fetchRoutineRunsApi(routineId as string),
    enabled,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      if (runs.some((r) => isAgentRunWorking(r.status))) return 3000;
      if (runs.length > 0) return 12000;
      return false;
    },
  });
  return { runs: data?.runs ?? [], loading: enabled && isPending };
}
