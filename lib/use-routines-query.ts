"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { fetchRoutineRunsApi, fetchRoutinesApi, type Routine } from "./routines-api";
import { isAgentRunWorking } from "./agent-api";

/**
 * ROUTINES (MIN-185) on the client side.
 *
 * The list does NOT poll: a routine only moves when it is created, when it is edited or
 * when it expires, and all three go through an explicit invalidation (mutation
 * local, or realtime bridge for one passage that starts). A timer would only
 * pay for requests for a list that is immobile 23 hours a day.
 *
 * EXECUTIONS follow the rule for agent runs: ~3 s as long as a
 * passage works, a net of 12 s as long as there are runs, nothing at all all
 * then.
 */

export function routinesQueryKey() {
  return ["routines"] as const;
}

export function routineRunsQueryKey(routineId: string) {
  return ["routines", routineId, "runs"] as const;
}

/**
 * Writes a routine INTO CACHE, without query — the base of the toggle
 * OPTIMISTIC switch (MIN-185).
 *
 * The column and the detail pane read the same entry: a single write updates
 * both in the same rendering, without waiting for the server. Returns
 * the BEFORE snapshot, to be reinstalled as is if the write is refused —
 * putting back "by hand" the field that we believe to have changed would miss everything that
 * the server changes with it (here `next_run_at`).
 *
 * `undefined` = the list is not yet cached: then there is nothing to undo, and the next load will tell the truth.
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
