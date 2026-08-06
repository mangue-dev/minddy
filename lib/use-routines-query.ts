"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchRoutineRunsApi, fetchRoutinesApi } from "./routines-api";
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
