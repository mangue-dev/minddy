"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { fetchAgentReadsApi, markAgentSessionReadApi } from "./agent-api";

/**
 * État « lu » des sessions d'agent (bulle bleue « terminé, non lu »). Une carte
 * { issueId → last_read_at } partagée par toutes les surfaces (liste /agents, badge
 * sidebar, sélecteur de runs). `markRead` estampille MAINTENANT, de façon optimiste,
 * pour vider la bulle sans attendre le round-trip serveur.
 */

const AGENT_READS_KEY = ["agent-reads"] as const;

type ReadsData = { reads: Record<string, string> };

// Dédoublonne les POST concurrents pour une même issue (plusieurs surfaces peuvent
// déclencher le mark-read à l'ouverture) — au niveau module, partagé entre instances.
const inFlight = new Set<string>();

export function useAgentReads() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data } = useQuery({
    queryKey: AGENT_READS_KEY,
    queryFn: fetchAgentReadsApi,
    enabled: !!userId,
  });

  const reads = useMemo(() => data?.reads ?? {}, [data]);

  const markRead = useCallback(
    (issueId: string) => {
      if (!issueId) return;
      const now = new Date().toISOString();
      const previous = queryClient.getQueryData<ReadsData>(AGENT_READS_KEY);
      // Optimiste : avance le curseur de lecture tout de suite (bulle vidée sur la
      // liste + le badge sidebar). Toujours sûr — `now` est postérieur à toute fin.
      queryClient.setQueryData<ReadsData>(AGENT_READS_KEY, (old) => ({
        reads: { ...old?.reads, [issueId]: now },
      }));
      if (inFlight.has(issueId)) return;
      inFlight.add(issueId);
      void markAgentSessionReadApi(issueId)
        .catch(() => {
          // Échec réseau → rollback ; le prochain refetch réconciliera de toute façon.
          queryClient.setQueryData<ReadsData>(AGENT_READS_KEY, previous);
        })
        .finally(() => inFlight.delete(issueId));
    },
    [queryClient],
  );

  return { reads, markRead };
}
